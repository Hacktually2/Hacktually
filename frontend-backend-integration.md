# Frontend / backend integration

What the backend has to return for the dashboard to render, field by field.

The frontend is already built and running against fixtures. Every screen reads
from `app/dummy-data/`, where each accessor is an async function whose return
type is exactly what the corresponding endpoint must produce. When an endpoint
is ready, replace that one function body with a `fetch` and nothing else in the
app changes.

```ts
// app/dummy-data/index.ts — the only file that has to change
export async function getOverview(datasetId: string): Promise<OverviewResponse> {
  const res = await fetch(`${API}/api/v1/overview/${datasetId}`);
  return res.json();
}
```

The canonical types live in `app/dummy-data/types.ts`. This document explains
the parts a JSON schema cannot: which fields drive which pixels, what must stay
consistent between endpoints, and what the frontend refuses to compute.

---

## 1. Ground rules

These hold across every endpoint. Most of them exist because a screen breaks or
lies if they are violated.

### The frontend computes no business values

It formats and it filters for display. It does not derive risk, coverage,
recommended quantities, safety stock, health scores, or demand classes. If a
number appears on screen, the backend sent that number.

This is not a preference. Two screens showing different risk for the same SKU is
the fastest way to lose a demo, so there is exactly one place that decides.

### Missing is not zero

Any metric the dataset cannot support is sent as `null` with a reason, never as
`0`. The UI renders "Unavailable" plus the reason.

```json
{ "key": "inventory_value", "value": null,
  "unavailable_reason": "Unit cost is not present in this dataset." }
```

A `0` means the system measured zero. A `null` means it could not measure.

### One vocabulary for risk

`risk` is always one of `healthy | watch | at_risk | critical`. The frontend has
a fixed label, icon and colour per value. `risk_label` may carry your own wording
for display, but the enum drives everything else, so do not invent a fifth state
or use "high"/"medium"/"low" in one endpoint and these in another.

### Dates and numbers

- Dates: ISO-8601. Date-only (`2026-09-17`) for series points, full timestamps
  with offset (`2026-09-17T13:42:00+07:00`) for "generated at" fields.
- Numbers: raw. Send `0.128`, not `"12.8%"`; send `4862400000`, not `"Rp 4.9B"`.
  Percentages are the exception: send `11.4` for 11.4%, not `0.114`.
- No thousands separators, no currency symbols, no units inside strings.

---

## 2. Endpoint map

| Endpoint | Status | Feeds |
| --- | --- | --- |
| `GET /api/v1/projects` | **missing** | Project chooser |
| `GET /api/v1/projects/{projectId}` | **missing** | Dashboard shell |
| `POST /api/v1/ingest` | in contract, not wired | Upload |
| `GET /api/v1/datasets/{id}/mapping` | in contract | Review screen |
| `POST /api/v1/datasets/{id}/mapping` | in contract, not wired | Confirm mapping |
| `GET /api/v1/datasets/{id}/health` | in contract | Review screen |
| `GET /api/v1/jobs/{job_id}` | in contract | Processing screen |
| `GET /api/v1/overview/{dataset_id}` | **missing** | Overview tab |
| `GET /api/v1/demand/{dataset_id}` | **missing** | Demand & Sales tab |
| `GET /api/v1/recommendations/{dataset_id}` | in contract | Supply Chain tab |
| `GET /api/v1/value/{dataset_id}` | in contract | Supply Chain, value panel |

Three read models do not exist in `architecture.md` yet. They are marked
`NEEDS-ENDPOINT` in the type file too. They are read-only projections over data
the pipeline already produces, so they should be cheap.

---

## 3. Projects

`GET /api/v1/projects` → `Project[]`

A project is the analytical context: an organisation, a dataset, and the results
derived from it.

```json
{
  "project_id": "prj-abc",
  "name": "Sales 2026",
  "organisation": "PT ABC Distribution",
  "industry_mode": "ritel",
  "dataset_id": "ds_8f21c4",
  "dataset_filename": "sales_2026.csv",
  "uploaded_at": "2026-09-17T06:12:00+07:00",
  "forecast_generated_at": "2026-09-17T13:42:00+07:00",
  "last_opened_at": "2026-09-17T14:08:00+07:00",
  "status": "ready",
  "horizon_days": 30,
  "series_total": 428,
  "health_score": 82,
  "demand_sparkline": [1700, 1812, 1764, "…16 values"]
}
```

Notes:

- `status` is `ready | processing | needs_review | failed`. It decides where the
  card links: ready goes to the dashboard, needs_review to the review screen,
  processing to the progress screen.
- `uploaded_at` and `forecast_generated_at` are shown separately because they are
  different events. `forecast_generated_at` is `null` until a run completes.
- `industry_mode` switches the decision engine between purchase quantities and
  production quantities.
- `demand_sparkline` is roughly 16 aggregate points for the card trend. Exact
  length does not matter; it is normalised for drawing.

---

## 4. Mapping and health

### `GET /api/v1/datasets/{id}/mapping` → `MappingResponse`

Drives the review table. The user must be able to see what was detected, how
sure the system is, and why.

```json
{
  "dataset_id": "ds_8f21c4",
  "preset_matched": "Accurate Online — Sales Detail export",
  "overall_confidence": "high",
  "unmapped_columns": ["no_faktur", "nama_sales", "ppn"],
  "fields": [{
    "source_column": "qty_out",
    "detected_field": "Demand Quantity",
    "canonical_key": "target",
    "confidence": "medium",
    "confidence_score": 0.74,
    "resolved_by": "rule",
    "reasoning": "Numeric, non-negative in 99.9% of rows, and moves with transaction frequency.",
    "sample_values": ["12", "25", "9"],
    "required": true,
    "alternatives": [
      { "canonical_key": "inventory", "label": "Inventory on hand" },
      { "canonical_key": "ignore", "label": "Do not use this column" }
    ]
  }]
}
```

Notes:

- `reasoning` is rendered verbatim behind a "Why this interpretation?"
  disclosure. Write it for a planner, not for a log file.
- `resolved_by` is `preset | rule | model` and is shown as a caption, which is
  how the three-tier story becomes visible rather than claimed.
- `alternatives` populates the override dropdown. The frontend prepends the
  detected option, so do not repeat it here.
- `sample_values` are strings so they render exactly as they appear in the file.

`POST /api/v1/datasets/{id}/mapping` takes `{ overrides: { source_column:
canonical_key } }` and only the changed columns are sent.

### `GET /api/v1/datasets/{id}/health` → `HealthReport`

```json
{
  "rows_received": 154239, "duplicates_found": 193,
  "missing_timestamps": 82, "negative_values": 7,
  "series_total": 428, "series_forecastable": 417,
  "detected_frequency": "Daily", "history_span_months": 21,
  "health_score": 82,
  "series_excluded": [
    { "series_id": "ABC-120__JKT-01", "reason": "Only 6 weeks of history" }
  ],
  "findings": [{
    "id": "censored", "severity": "warning",
    "title": "Demand was censored in 38 series",
    "detail": "Stock reached zero while sales stayed flat at a ceiling…",
    "action": "Review the affected series in Demand & Sales"
  }]
}
```

**`series_excluded` must contain every excluded series**, not a sample. The
screen states "N of M series have too little history", and N is the array length.
It has to equal `series_total - series_forecastable` or the page contradicts
itself.

`findings` is ordered by what matters most; the frontend renders it in order.
`severity` is `info | warning | critical`.

---

## 5. Jobs

`GET /api/v1/jobs/{job_id}` → `JobState`

The processing screen polls this and renders whatever comes back. It currently
walks a canned sequence; swap the timer for a poll and the component is unchanged.

```json
{
  "job_id": "job_5a1c90", "dataset_id": "ds_8f21c4",
  "status": "forecasting", "progress": 71,
  "message": "Forecasting 417 series over a 30-day horizon",
  "steps": [
    { "key": "upload", "label": "File received", "state": "done", "detail": "154,239 rows · 18.4 MB" },
    { "key": "forecast", "label": "Generating forecasts", "state": "active", "detail": null }
  ]
}
```

- `status`: `queued | profiling | cleaning | classifying | forecasting | validating | completed | failed`
- `steps[].state`: `done | active | pending | failed`
- `progress` is 0–100 and should be monotonic. Keep the same `steps` keys across
  polls so rows do not reorder mid-run.

---

## 6. Overview (missing endpoint)

`GET /api/v1/overview/{dataset_id}` → `OverviewResponse`

Four parts: KPI row, main chart, inventory posture, ranked actions.

### KPIs

```json
{
  "key": "demand_forecast", "label": "Demand Forecast",
  "value": 58204, "unavailable_reason": null,
  "unit": "units", "context": "Next 30 days · 417 series",
  "comparison": { "delta_percent": 1.9, "direction": "up", "label": "vs previous 30 days" },
  "accent": "demand", "href": "/projects/prj-abc/dashboard/demand"
}
```

- `unit` is `units | idr | count | percent` and selects the formatter.
- `comparison` is `null` when there is no prior period to compare against.
- `accent` is `demand | forecast | inventory | risk` and only picks the colour of
  a small rule on the card.

### Chart

`demand_chart` is a `ForecastSeries`, the same shape used on Demand & Sales.

```json
{
  "label": "Actual vs forecast demand",
  "cutoff_index": 119,
  "unit": "units",
  "historical_range": { "from": "2026-05-20", "to": "2026-09-16" },
  "forecast_range":   { "from": "2026-09-17", "to": "2026-10-16" },
  "points": [
    { "t": "2026-05-20", "actual": 1703, "forecast": null, "lower": null, "upper": null },
    { "t": "2026-09-16", "actual": 2104, "forecast": 2104, "lower": 2104, "upper": 2104 },
    { "t": "2026-09-17", "actual": null, "forecast": 1987, "lower": 1848, "upper": 2126 }
  ]
}
```

Three rules the chart depends on:

1. **`cutoff_index` is the index of the last OBSERVED point**, not the first
   forecast one. `points[cutoff_index].actual` must be non-null and
   `points[cutoff_index + 1].actual` must be null.
2. **Stitch the join.** That same last observed point also carries
   `forecast`, `lower` and `upper` equal to its `actual`. Without this the two
   lines show a one-period gap at exactly the moment the eye is looking.
3. **Bracket the interval.** Wherever `forecast` is non-null, `lower <= forecast
   <= upper`. The band is drawn as a polygon between them and inverts visibly if
   this is violated.

Points must be sorted ascending and evenly spaced. The hover readout finds the
nearest point by arithmetic on a uniform axis rather than searching, so an
irregular axis puts the crosshair on the wrong date.

### Inventory posture and priority actions

```json
"inventory": {
  "bands": [{ "risk": "critical", "label": "Stockout risk", "series_count": 2 }],
  "total_series": 18,
  "inventory_value": { "available": false, "reason": "Unit cost is not present in this dataset." },
  "median_coverage_days": 34,
  "narrative": "Cover is adequate across most of the portfolio…"
},
"priority_actions": [{
  "rank": 1, "series_id": "KCG-200__SBY-02",
  "item_name": "Kacang Garuda 200g", "location": "Surabaya",
  "headline": "Order 4,250 units",
  "reason": "7 days of cover against a 14-day lead time.",
  "risk": "critical",
  "metric_label": "Days until stockout", "metric_value": 7, "metric_unit": "days",
  "href": "/projects/prj-abc/dashboard/supply-chain?series=KCG-200__SBY-02"
}]
```

`inventory_value` uses the `Maybe<number>` wrapper: either
`{ "available": true, "value": 2400000000 }` or
`{ "available": false, "reason": "…" }`.

`narrative` is one or two sentences of plain prose, rendered as written.

---

## 7. Demand & Sales (missing endpoint)

`GET /api/v1/demand/{dataset_id}?date_range=&product=&location=&compare=`

Filtering happens server-side. The frontend puts the selection in the URL, passes
it through, and renders whatever comes back; it never filters a chart itself.

Query parameters, all optional, each defaulting as shown:

| Param | Values | Default |
| --- | --- | --- |
| `date_range` | `18m`, `12m`, `6m`, `90d` | `18m` |
| `product` | an `item_id`, or `all` | `all` |
| `location` | a `location_id`, or `all` | `all` |
| `compare` | `forecast`, `sales`, `baseline`, `none` | `forecast` |

Echo the resolved selection back in `active_filters`. The controls render from
that, so if you clamp or ignore a parameter, say so there and the UI stays honest.

The response carries `chart` (a `ForecastSeries`, with `sales` populated on each
point when `compare=sales`), `accuracy`, `pattern`, `sales_by_product`,
`sales_by_location`, `forecast_rows`, and the `filters` option lists.

```json
"accuracy": {
  "model_name": "TimesFM",
  "model_reason": "Selected per segment from 2 rolling validation windows…",
  "wape_percent": 11.4, "bias_percent": 1.9, "mase": 0.81,
  "baseline_name": "Seasonal naive", "baseline_wape_percent": 19.7,
  "validation_windows": 2
},
"pattern": {
  "total_series": 428,
  "classes": [{
    "demand_class": "smooth", "label": "Smooth",
    "series_count": 206, "share_percent": 48.1,
    "description": "Regular intervals, stable volume.",
    "typical_model": "TimesFM"
  }]
}
```

- `bias_percent` is signed. Positive means over-forecast; the sign is rendered.
- `mase` may be `null` when it does not apply.
- `classes` must cover every series: counts sum to `total_series`, shares sum to
  100 (±0.5 for rounding).

`forecast_rows` is the detail table. It is currently sent whole and sorted in the
browser, which is fine at hundreds of rows. Past a few thousand, add
`?page=&page_size=` and a `total`, and the table switches to server-side paging.

---

## 8. Supply Chain

`GET /api/v1/recommendations/{dataset_id}?risk=&location=&category=`

`risk` accepts any `RiskLevel`, plus `all` and **`attention`**, which means
`critical` or `at_risk`. The Overview stockout KPI links straight to
`?risk=attention`, so that value has to work.

```json
{
  "series_id": "KCG-200__SBY-02",
  "item_id": "KCG-200", "item_name": "Kacang Garuda 200g",
  "location_id": "SBY-02", "location": "Surabaya", "category": "Snack",
  "current_stock": 3459, "forecast_demand": 14359,
  "lead_time_demand": 6701, "safety_stock": 985,
  "coverage_days": 7, "days_until_stockout": 7,
  "risk": "critical", "risk_label": "Stockout risk",
  "recommended_qty": 4250, "lead_time_days": 14, "moq": 250,
  "demand_class": "erratic", "model": "TimesFM", "wape_percent": 10.8,
  "explanation": {
    "lines": [
      { "label": "Demand during lead time", "value": 6701,  "kind": "add" },
      { "label": "Safety buffer",           "value": 985,   "kind": "add" },
      { "label": "Current stock",           "value": -3459, "kind": "subtract" },
      { "label": "MOQ adjustment",          "value": 23,    "kind": "adjust" }
    ],
    "total_label": "Recommended order",
    "total_value": 4250
  },
  "recent_demand": [312, 0, 289, "…12 values"]
}
```

Two hard requirements on `explanation`:

1. **The lines must sum to `recommended_qty`.** They are rendered as an
   accounting breakdown directly under the number. If they do not add up, the
   "no black box" promise fails in the most visible way possible.
2. **Subtractions are negative.** Send `-3459`, not `3459` with
   `kind: "subtract"`. The frontend renders the sign from the value; `kind` only
   selects the label styling.

Also:

- `days_until_stockout` is `null` when no stockout is projected inside the
  horizon. It renders as an em dash.
- `recommended_qty` of `0` means no order is needed, and the drawer says so
  instead of showing a breakdown. Send `0`, not `null`.
- `recommended_qty` should be a whole multiple of `moq` when it is above zero.
- `summary[]` counts must match the rows for the same filter.

`GET /api/v1/value/{dataset_id}` → `ValueSimulation` is flat: baseline and model
figures for fill rate, stockout events and average inventory, plus
`net_benefit_idr` and a `window_label`.

---

## 9. Consistency across endpoints

These span responses, so nothing catches them except agreement between services.
There is a runnable check for all of them against the fixtures:

```bash
npm run check:fixtures
```

| Invariant | Why it matters |
| --- | --- |
| Overview stockout KPI value equals the count of `critical` + `at_risk` rows | Overview says 5, Supply Chain lists 7, nobody trusts either |
| `inventory.bands[].series_count` matches the rows per risk | Same |
| Every `priority_actions[].series_id` exists in the recommendations rows | The drill-down link 404s otherwise |
| A priority action's `risk` and `metric_value` match that row | Two screens, one SKU, two answers |
| `series_excluded.length == series_total - series_forecastable` | The review screen states both |
| Explanation lines sum to `recommended_qty` | Visible arithmetic |
| Demand class counts sum to `total_series`, shares to 100 | The distribution bar is drawn from shares |
| `lower <= forecast <= upper` on every forecast point | The interval band inverts |
| `cutoff_index` lands on the last observed point | The NOW marker moves to the wrong date |

Point the check at live responses once the endpoints exist and it becomes a
contract test.

---

## 10. Known rough edges

**`href` fields leak frontend routes into the API.** `KpiMetric.href` and
`PriorityAction.href` currently hold full paths like
`/projects/prj-abc/dashboard/supply-chain?series=KCG-200__SBY-02`. That makes the
backend responsible for the frontend's routing, and a URL change becomes a
backend deploy. Better: return the identifiers (`series_id`, and a `target` enum
like `demand | supply_chain`) and let the frontend build the link. Worth fixing
before the endpoints harden, and it is a small change on both sides.

**Per-series charts are not wired.** `GET /forecasts/{dataset_id}/{series}` is in
the contract but unused. Selecting a single product on Demand & Sales currently
narrows the tables while the chart stays aggregate, and the page says so on
screen. Wiring that endpoint removes the caveat.

**Auth is a stub.** `app/dummy-data/accounts.ts` holds a hardcoded demo account
and the session is an unsigned cookie. Not a security boundary, and it should be
replaced wholesale rather than extended.

**`ForecastSeries.unit` is typed as the literal `"units"`.** Widen it if a series
is ever denominated in anything else.
