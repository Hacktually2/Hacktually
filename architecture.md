# Architecture — Adaptive Demand Forecasting

Build reference. What we are building and how the pieces fit. Execution schedule, cuts and pitch live in [PLAN.md](PLAN.md).

## Frozen vs swappable

Freeze these at hour 2. Everything else can change on new research without hurting anyone.

| Frozen — expensive to change | Swappable — cheap to change |
| --- | --- |
| Canonical data model (field names and semantics) | Which models compete in the router |
| REST API contract (paths, request/response field names) | Mapping rules, ERP presets, LLM prompts |
| SQLite table shapes | Cleaning rules and health scoring weights |
| `series_id` construction rule | Decision formulas, safety stock policy |
| | Calendar contents, UI, MCP tool set |

The adapter interfaces are what make the right column cheap. Do not bypass them for speed.

## System flow

```
CSV or JSON  ──►  one ingest endpoint
                       │
                       ▼
              PROFILE + MAP
              presets first, rules second, LLM last
              human confirms, confidence shown
                       │
                       ▼
              CANONICAL MODEL
              timestamp | series_id | target | optional
                       │
                       ▼
              CLEAN (4 rules)  ──►  DATA HEALTH REPORT
                       │
                       ▼
              ENRICH
              Indonesian calendar  +  censored demand mask
                       │
                       ▼
              SEGMENT  ADI + CV²
              smooth | erratic | intermittent | lumpy
                       │
                       ▼
              ROUTE  2-3 candidates per segment
                       │
                       ▼
              BACKTEST  2 windows  ──►  SELECT (segment or series)
                       │
                       ▼
              FINAL FORECAST  batched, with quantiles
                       │
                       ▼
              DECIDE
              ritel ──► purchase order qty
              manufaktur ──► production qty ──► raw material
                       │
                       ▼
              VALUE SIMULATION  →  rupiah
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    Dashboard      REST API       MCP server
                                       │
                              agents / Slack / WA
```

## Canonical data model

Every dataset becomes this. The pipeline knows nothing else.

```
required:
  timestamp     datetime, normalized to detected frequency
  series_id     string
  target        float, the demand quantity

optional:
  item_id       string
  location_id   string
  inventory     float
  price         float
  promo         0/1
  category      string
  lead_time     int, days
  moq           float
```

`series_id = item_id + "__" + location_id`, or `item_id` alone when there is no location.

Never add a required field. New signals arrive as optional columns and the models use them when present.

## Ingestion

One endpoint, content-type decides the parser. "CSV is just a transport" is a pitch line, not a subsystem.

```
POST /api/v1/ingest      multipart CSV, or application/json {source, records[]}
  -> {dataset_id, status: "profiling"}
```

## Profiling and mapping

Three tiers, cheapest and most reliable first. Each tier only handles what the one above could not.

**Tier 1 — ERP presets.** Mid-market Indonesia runs a handful of systems. Match the header fingerprint against known exports (Accurate, Jubelio, HashMicro, SimpliDOTS, Moka) and map directly. No network, no inference, instant, and it demos as market knowledge rather than a model call.

**Tier 2 — rules.** dtype, null ratio, cardinality, monotonicity, sample values, name matching against a synonym table. Handles most generic exports.

**Tier 3 — LLM.** Only ambiguous columns, and only metadata — never the data itself.

```json
{"column": "qty_out", "dtype": "integer", "sample": [12, 25, 9, 31],
 "min": 0, "max": 840, "null_ratio": 0.001, "cardinality": 412}
```

Every mapping carries a confidence. The user confirms before anything runs.

```
GET  /api/v1/datasets/{dataset_id}/mapping
POST /api/v1/datasets/{dataset_id}/mapping    {overrides: {...}}
```

## Cleaning

Deterministic. AI understands semantics; code cleans data. Four transforms only — everything else is a flag in the report, not a mutation.

1. Sort by timestamp, aggregate duplicate `(timestamp, series_id)` rows
2. Detect frequency, reindex to a complete time axis
3. Negative target → flag as return, exclude from fitting
4. Normalize frequency (resample) when intervals are irregular

Reported but not transformed: anomaly spikes, sparsity, short history, censored demand.

**Data health report** is a deliverable, not a score. It must end with what to fix:

```json
{"rows_received": 154239, "duplicates_found": 193, "missing_timestamps": 82,
 "negative_values": 7, "series_total": 428, "series_forecastable": 417,
 "series_excluded": [{"series_id": "ABC__JKT", "reason": "only 6 weeks of history"}],
 "health_score": 82}
```

## Enrichment

### Indonesian calendar

One row per date, joined onto every series. Passed to the model as known-future covariates, because every value is known in advance for the whole horizon.

```
date, is_ramadan, days_to_lebaran, is_thr_window,
is_payday_week, is_regional_holiday, is_school_term
```

`days_to_lebaran` is signed and matters most in the range −30 to +14. Lebaran moves roughly 11 days earlier each year, which is precisely what fixed-calendar seasonality cannot represent.

Fallback if covariates underperform: estimate a multiplicative uplift factor per category from history (mean demand in the 3 weeks pre-Lebaran vs baseline) and apply it to the forecast. Same demo, simpler mechanism.

### Censored demand

Where inventory reaches zero or sales sit flat at a ceiling, recorded sales understate real demand. Mask those periods from fitting and mark them `demand_censored` in the health report. We forecast demand, not sales.

## Segmentation

Per series, deterministic, no training:

```
ADI = mean interval between non-zero demand
CV² = (std of non-zero demand / mean of non-zero demand)²

ADI < 1.32 and CV² < 0.49  -> smooth
ADI < 1.32 and CV² >= 0.49 -> erratic
ADI >= 1.32 and CV² < 0.49 -> intermittent
ADI >= 1.32 and CV² >= 0.49 -> lumpy
```

Segmentation does not pick the model. It picks which models are allowed to compete.

## Model router

```
smooth       -> TimesFM, SeasonalNaive
erratic      -> TimesFM, SeasonalNaive
intermittent -> TimesFM, TSB, SeasonalNaive
lumpy        -> TimesFM, Croston, SeasonalNaive
```

Every model implements one interface, so swapping TimesFM for Chronos or a commercial checkpoint touches one file:

```python
class ForecastModel:
    name: str
    def forecast(self, series, horizon, covariates=None) -> Forecast: ...
```

TimesFM loads once at startup as a singleton and is always called through `predict_batch`. Never per-series in a loop.

## Backtest and selection

Two rolling windows. Not ten — 1,000 series × 4 models × 10 folds is 40,000 runs and no extra credit.

Metrics: WAPE for smooth and erratic, MASE for intermittent and lumpy (WAPE denominators approach zero on sparse demand and the ranking becomes noise). Bias reported alongside, always.

Selection rule, stated precisely because a judge will probe it:

- Fewer than 3 validation points per series → pick per **segment**, apply across it
- 3 or more → pick per **series**, but only when the margin exceeds the spread across folds
- Otherwise fall back to the segment default

Selecting a model on two observations is fitting noise. Saying so out loud is worth more than pretending otherwise.

## Decision engine

Forecast plus business parameters. Never invent a missing parameter — ask, or return the forecast alone.

Parameters are entered **per category with bulk apply**, overridable per SKU. A mid-market ops lead cannot type lead time for 428 SKUs, and that is where a trial dies.

```
demand_over_lead_time = sum(forecast[0:lead_time])
safety_stock          = z(service_level) * demand_std * sqrt(lead_time)
required              = demand_over_lead_time + safety_stock
raw_reorder           = max(0, required - current_inventory)
recommended           = ceil(raw_reorder / moq) * moq
```

Two output modes off the same forecast:

```
ritel      -> recommended purchase order quantity
manufaktur -> required production quantity -> raw material need (x BOM factor)
```

Output is always explainable as a sum. No black box:

```
Demand during lead time   4,200
Safety buffer               800
Current stock            -1,700
MOQ adjustment             +200
                        =  3,500
```

## Value simulation

The money slide. Run the same replenishment policy under both forecasts across the backtest windows and count outcomes, rather than comparing error metrics.

```
for each window, for each candidate forecast:
    simulate replenishment
    accumulate: fill_rate, stockout_events, avg_inventory_value, lost_sales_units
```

Baseline is the customer's likely current practice — a moving average — not a strawman. Report the delta in rupiah using user-supplied margin and holding cost.

## Storage

SQLite. Zero setup, and nobody scores database networking.

```
datasets        dataset_id, filename, created_at, schema_mapping, health_score, preset_matched
jobs            job_id, dataset_id, status, progress, created_at
series_profiles series_id, dataset_id, adi, cv2, demand_class, n_obs, censored_periods
forecasts       forecast_id, job_id, series_id, timestamp, forecast, lower, upper,
                model_name, wape, mase, bias
recommendations series_id, mode, stockout_risk, days_until_stockout,
                recommended_qty, explanation_json
```

## API contract

Frozen at hour 2. Everyone codes against this.

```
POST /api/v1/ingest                          -> {dataset_id, status}
GET  /api/v1/datasets/{id}/mapping           -> {fields[], confidence, preset_matched}
POST /api/v1/datasets/{id}/mapping           -> {ok}
GET  /api/v1/datasets/{id}/health            -> health report
POST /api/v1/datasets/{id}/forecast          -> {job_id}
GET  /api/v1/jobs/{job_id}                   -> {status, progress}
GET  /api/v1/forecasts/{dataset_id}          -> paginated series forecasts
GET  /api/v1/forecasts/{dataset_id}/{series} -> single series with history
GET  /api/v1/recommendations/{dataset_id}    -> ranked action list
GET  /api/v1/value/{dataset_id}              -> value simulation result
POST /api/v1/alerts/slack                    -> {sent}
```

Long work runs in FastAPI `BackgroundTasks` with status in SQLite. No Celery, no Redis.

## Interfaces

Dashboard, REST and MCP are three views of one service layer. Business logic lives in the service layer, never in an endpoint or an MCP tool.

```
           ┌── Dashboard (Next.js)
           │
service ───┼── REST API
 layer     │
           └── MCP server ──► agents, Slack, WhatsApp
```

### MCP tools

```
ingest_csv(path)                      -> dataset_id    # filesystem-capable agents only
ingest_rows(rows[])                   -> dataset_id
get_data_health(dataset_id)
confirm_mapping(dataset_id, overrides)
run_forecast(dataset_id, horizon)     -> job_id
get_job(job_id)
get_stockout_risk(location?, top_n=10)
get_reorder_recommendation(sku, location)
explain_forecast(series_id)           # which model won and why
send_procurement_alert(series_ids[])  # write — requires confirmation
```

Reads run freely. Writes require human confirmation. Never return full series into an agent's context — top-N with an id to drill into.

## Frontend

```
/upload          drag CSV, or show the API contract
/mapping         confirm detected fields, confidence per field
/health          what we found and what to fix
/dashboard       THE LANDING SURFACE — ranked action list
/forecast/{id}   one series, history + forecast + why this model
```

The wizard is onboarding and happens once. `/dashboard` is the recurring surface: *these 12 things need ordering this week, this much each*. Charts are secondary to the list.

## Module layout

```
backend/app/
├── main.py
├── api/            ingest.py datasets.py forecasts.py recommendations.py
├── schema/         profiler.py presets.py mapper.py canonical.py
├── cleaning/       pipeline.py health.py
├── enrich/         calendar.py censoring.py
├── demand/         classifier.py
├── forecasting/    base.py timesfm.py naive.py croston.py tsb.py router.py
├── evaluation/     backtest.py metrics.py selection.py
├── decision/       reorder.py production.py value_sim.py
├── integrations/   slack.py mcp_server.py
├── services/       ← business logic all three interfaces call
└── db/             database.py models.py

data/
├── calendar_id.csv
└── app.db
```

## Deployment

Hackathon: `uvicorn` + `next dev` on the L40S. Docker Compose at hour 22 only if ahead.

Production story, which is a slide and not work:

```
SQLite          -> PostgreSQL
local files     -> object storage
BackgroundTasks -> queue + workers
Docker Compose  -> Kubernetes on Cloudeka
single L40S     -> autoscaled Deka GPU
CSV / API       -> ERP / POS / WMS connectors
demo key        -> tenant isolation + SQURA WAF
demo URL        -> listed on LAMPU
```

## Not building

Fine-tuning or retraining of any kind. LightGBM/XGBoost. Real ERP connectors. Kubernetes. Auth beyond a demo key. Multi-tenancy. Celery/Redis. Postgres. Arbitrary format support beyond CSV and JSON.
