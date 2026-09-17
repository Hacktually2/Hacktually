# Frontend ↔ backend integration report

**Date:** 2026-09-17
**Frontend:** Next.js 16.3.2, this repo
**Backend:** FastAPI service in `backend/`, run locally at `http://localhost:8000` with
`DISABLE_TIMESFM=1` (baselines + calendar wrapper only; TiRex-2 not installed)
**Dataset under test:** `data/generated/penjualan_abc_distribution.csv` — 138,789 rows,
8 branches, 40 SKUs, 18 months

Everything below was verified against the running service, not read off the contract in
`architecture.md`. Where the two disagree, this report follows the wire.

---

## 1. What this changed

The frontend used to read entirely from `app/dummy-data/`. It now calls the real service
through three new files, and falls back to fixtures **loudly** when it cannot.

```
lib/backend/types.ts      the backend's ACTUAL response shapes, transcribed from live responses
lib/backend/client.ts     the only place this app calls the service: timeouts, typed errors
lib/backend/adapters.ts   backend shape -> the types the screens render. Translation only.
lib/backend/source.ts     live-or-fixture resolution, and the note that explains which
```

`app/dummy-data/index.ts` is still the single data layer — the promise in
`frontend-backend-integration.md` held. Every accessor now returns `Sourced<T>`:

```ts
{ data: T, live: boolean, note: string | null }
```

`note` is rendered on screen by `components/ui/data-source.tsx`. **A fallback is never
silent.** A dashboard quietly showing fixtures is worse than one that breaks, because
nobody finds out until someone orders stock against an invented number.

### The rule the adapters follow

`adapters.ts` renames fields, inverts one table, converts fractions to percentages and maps
one enum onto another. It does **no** business arithmetic — no coverage days, no risk band
derived from stock levels, no safety stock. Where the backend does not send something a
screen needs, the value arrives as `null` and the screen renders `—` with the reason on
hover. Every one of those nulls is a numbered gap in §4.

This is the rule from `frontend-backend-integration.md` §1 ("the frontend computes no
business values"), kept deliberately. The moment the adapter starts computing, two surfaces
can disagree about the same SKU.

---

## 2. What works, verified live

| Flow | Endpoint | Result |
| --- | --- | --- |
| Upload | `POST /api/v1/ingest` | ✅ 138,789 rows accepted, `ds_50684246daa6` |
| Branch split | *(auth layer, local)* | ✅ 8 branches from `kode_cabang` |
| Column mapping | `GET /api/v1/datasets/{id}/mapping` | ✅ all 7 columns detected and adapted |
| Confirm mapping | `POST /api/v1/datasets/{id}/mapping` | ✅ health 95, 270 series, 138,789 rows |
| Start forecast | `POST /api/v1/datasets/{id}/forecast` | ✅ `job_1e782bf8ffb8` |
| Poll job | `GET /api/v1/jobs/{job_id}` | ✅ completed, all six steps `done` |
| Recommendations | `GET /api/v1/recommendations/{id}` | ✅ 200 rows, 9 at risk, 3,486 units |
| Value simulation | `GET /api/v1/value/{id}` | ✅ adapted onto the value panel |
| Data health | `GET /api/v1/datasets/{id}/health` | ✅ |
| Dataset list | `GET /api/v1/datasets` | ✅ backs the project chooser |
| Per-series forecast | `GET /api/v1/forecasts/{id}/{series}` | ⚠️ works, but unusable — see B1 |
| Service down | *(backend killed mid-session)* | ✅ every screen fell back with a badge |

The real mapper output on the generated file, adapted and rendered:

```
tanggal_transaksi -> timestamp     qty_terjual   -> target
kode_produk       -> item_id       kode_cabang   -> location_id
stok_akhir        -> inventory     harga_satuan  -> price
kategori          -> category
```

### Screens now on live data

- **Review** — real column names, real confidence scores, the backend's own reasoning strings
- **Processing** — polls the real job every 1.5s, renders real stages, shows real failures
- **Supply Chain** — real recommendations, models, risk bands, reorder decomposition
- **Projects** — real datasets from `GET /api/v1/datasets`

### Screens still on fixtures, badged as such

- **Overview** (B9) · **Demand & Sales** (B10) · **Activity log** (B12) ·
  **Planning parameters** (B14) · **Scenario simulator** (B15) · **Update data** (B13)

---

## 3. What failed, and what it taught us

**A forecast on a truncated file fails, correctly.** A 4,000-row slice produced 270 series
of ~15 observations each and the job failed with `no forecastable series in this dataset`.
That is the right answer, it reached the UI, and the error is shown to the user. Not a bug.

**The job adapter had a bug, found by that failure.** The backend emitted stage
`"preparing data"`, which matched none of the step patterns, so every step rendered
`pending` next to a red error — "nothing happened" beside "it broke". Fixed in
`adapters.ts`: an unmatched stage now attributes the failure to the first step.

**Two internal functions were exported as public endpoints.** `registerUpload` and
`linkUploadToDataset` lived in `auth/actions.ts`, a `"use server"` module — every export of
one is a callable endpoint. `linkUploadToDataset(uploadId, datasetId)` should never be
callable alone. Moved to `auth/uploads.ts`, a plain server module.

**A backend blip turned every live dashboard into "page not found".** `getProject` could
not tell "the service says no such dataset" from "the service did not answer", so one
timeout 404'd a working project. Now only the first 404s; the second renders in degraded
mode with a badge.

**The old API client exposed the backend to the browser.** `app/lib/api.ts` used
`NEXT_PUBLIC_API_URL`, which ships to the client. The backend has no auth of its own, so a
browser that knows its address can read any dataset directly. Deleted; `lib/backend/client.ts`
is `server-only` and every call is proxied through a Server Component or Action that has
already checked branch access.

---

## 4. Backend gaps — what to build

Ordered by how much of the product each unblocks. **B1 is worth more than the rest
combined.**

### B1 — Historical actuals. No endpoint returns them. 🔴 BLOCKER

`GET /api/v1/forecasts/{id}/{series}` returns 30 future points and nothing else. No endpoint
anywhere serves the cleaned history those points are drawn against.

Every chart in this product is history-versus-forecast. Without actuals there is no demand
chart, no overview chart, no per-SKU sparkline, and no way to show a forecast in context —
which is most of what the product is for. **This single gap is why Overview and Demand &
Sales are still fixtures**, not the missing composite endpoints B9 and B10.

The data already exists — it is what the pipeline cleaned and fitted on.

```
GET /api/v1/series/{dataset_id}/{series_id}/history?from=&to=
→ { "series_id": "SKU-0033__CAB-JKT-01",
    "frequency": "daily",
    "points": [ { "t": "2025-01-01", "actual": 412 }, ... ] }
```

Or fold it into the existing endpoint as a `history` array beside `forecast`, which the
frontend prefers — one round trip, and the cutoff is unambiguous.

**Contract detail that matters:** the frontend draws a NOW marker at `cutoff_index`, and
the observed and predicted lines must meet there. The last historical point must also carry
`forecast`/`lower`/`upper` equal to its actual, or the chart shows a one-period gap.
`toForecastSeries` in `lib/backend/adapters.ts` is already written for this shape and
currently returns `cutoff_index: -1` to mean "forecast only".

### B2 — Mapping response carries no sample values

`GET /api/v1/datasets/{id}/mapping` returns `{canonical, source_column, confidence, reason}`.
The review screen shows sample values beside each column so a planner can *check* the guess
rather than trust it — that column currently renders empty.

Also missing: `unmapped_columns`. `POST /ingest` returns `columns`, `GET .../mapping` does
not, so after a reload there is no way to say "these 3 columns were ignored".

```
"fields": [ { "canonical": "target", "source_column": "qty_terjual",
              "confidence": 0.99, "reason": "...",
              "sample_values": ["5", "22", "13", "8"],     // ADD
              "resolved_by": "rule" } ],                    // ADD: preset|rule|model
"unmapped_columns": ["nama_cabang", "nama_produk"]          // ADD
```

`resolved_by` is currently guessed from whether a preset matched. Cosmetic, but it is
displayed to the user as fact.

### B3 — Findings are one string, the UI shows two levels

Backend sends `{level, text}`. The health panel renders a bold title and a detail paragraph,
so the title carries the whole sentence and the detail is empty.

```
{ "level": "warn",
  "title": "104 series look censored",                      // ADD
  "detail": "Sales hit exactly zero on 12% of days, ...",   // ADD
  "action": "Upload stock-on-hand to separate the two" }    // ADD, nullable
```

### B4 — Risk vocabulary mismatch

Backend: `high | medium | low`. Frontend, per the frozen contract: `healthy | watch |
at_risk | critical`. Adapter maps `high→at_risk`, `medium→watch`, `low→healthy`, so
**`critical` is unreachable from live data** and the most severe band never appears.

Either emit the four-value enum, or tell us what separates `at_risk` from `critical` so the
engine can. Do not let two endpoints use different vocabularies.

### B5 — Recommendations carry no inventory position

A recommendation carries ids plus the reorder decomposition. The inventory table needs the
position that produced it. Today the frontend scrapes three values out of
`explanation[].label` by regex — the values are real, but matching them by prose is fragile
(`"Demand during 14-day lead time"` embeds the lead time in a display string).

```
{ "series_id": "...",
  "current_stock": 212,          // exists, only inside explanation[]
  "lead_time_demand": 505.9,     // exists, only inside explanation[]
  "safety_stock": 64,            // exists, only inside explanation[]
  "forecast_demand_horizon": 1084,   // ADD — total over the horizon
  "coverage_days": 5,                // ADD — backend must own this
  "lead_time_days": 14,              // ADD — currently only inside a label
  "moq": 100,                        // ADD
  "service_level": 0.95 }            // ADD
```

`coverage_days` specifically: the frontend will not compute it. Two screens disagreeing
about days of cover is exactly the failure the integration doc forbids.

### B6 — No display names anywhere

`item_id: "SKU-0033"`, `location_id: "CAB-JKT-01"`, and no `item_name`, `location_name` or
`category`. Every table shows codes. The uploaded CSV has `nama_produk`, `nama_cabang` and
`kategori` right there — the mapper already detects `category` and then drops it.

```
{ "item_id": "SKU-0033", "item_name": "Minyak Goreng 2L",     // ADD
  "location_id": "CAB-JKT-01", "location_name": "Jakarta Pusat", // ADD
  "category": "Minyak & Bumbu" }                              // ADD
```

This also unblocks the category filter, which currently renders with no options.

### B7 — No project concept

`GET /api/v1/datasets` returns `dataset_id, filename, created_at, preset_matched,
health_score, mapping_confirmed, frequency, decision_mode`. The chooser also needs
`series_total`, `forecast_generated_at`, `horizon_days`, and a small `demand_sparkline`
(blocked on B1). `name` falls back to the filename and `organisation` is supplied by this
app's auth layer — that one is ours, not yours.

### B8 — Job stages are free text

`stage` is a prose string (`"preparing data"`, `"simulating business value"`). The frontend
regex-matches it onto six named steps. A wording change silently breaks the progress screen.

```
{ "stage": "forecasting",                        // enum, not prose
  "stage_label": "Forecasting and selecting models",
  "steps": [ {"key":"profiling","state":"done"}, ... ] }   // better still
}
```

Enum values the frontend already understands: `queued`, `profiling`, `cleaning`,
`classifying`, `forecasting`, `validating`, `completed`, `failed`.

### B9 — `GET /api/v1/overview/{dataset_id}` missing

The landing screen of the whole product. Needs KPI row, demand chart (B1), inventory
posture and ranked priority actions. Full shape in `app/dummy-data/types.ts` →
`OverviewResponse`; the fixture in `app/dummy-data/overview.ts` is a working example of
every field populated correctly.

Note `KpiMetric.value` is nullable with an `unavailable_reason` — **send `null` with a
reason, never `0`**. `0` means measured zero.

### B10 — `GET /api/v1/demand/{dataset_id}` missing

Chart (B1), accuracy, demand-pattern breakdown, sales by product and by location, forecast
rows, filter options. Some of the parts exist: `GET /forecasts/{id}` has `model_mix` and
per-series `wape`/`mase`/`bias`, and health has `demand_portfolio`. The chart does not, and
without it the screen has no spine.

### B11 — Nothing can be scoped to a branch 🔴 SECURITY

Recommendations and forecasts are returned for a whole dataset. There is no
`?location_id=` on any read endpoint.

This app grants managers access **per branch**. With one dataset per upload, a branch
manager's dashboard is served every branch's rows and the frontend filters for display.
**That is a display filter, not a security boundary** — the rows are already in the
response.

```
GET /api/v1/recommendations/{id}?location_id=CAB-JKT-01
GET /api/v1/forecasts/{id}?location_id=CAB-JKT-01
GET /api/v1/overview/{id}?location_id=CAB-JKT-01
```

Filtering server-side closes it. Until then, do not demo a manager account against a
dataset whose other branches are confidential.

### B12 — No activity log

`GET /api/v1/activity?dataset_id=` — who uploaded, who confirmed a mapping, when a forecast
ran and what changed. The jobs table has some of it already. Shape: `ActivityEvent` in
`app/dummy-data/types.ts`.

### B13 — No append/merge endpoint

The Update Data screen needs a dry run before anything is written:
`POST /api/v1/datasets/{id}/append?dry_run=true` → rows added/updated/unchanged/retained,
new series, coverage before/after, and a sample of conflicting rows. Shape: `MergePreview`.

### B14 — Planning parameters are engine constants

Lead time, service level and MOQ are hard-coded in `backend/app/decision/reorder.py`.
`architecture.md` says these are entered per category with bulk apply and per-SKU override.
Needs `GET/PUT /api/v1/datasets/{id}/parameters`, with a `source` per value
(`dataset | default | user`) so a planner can see which numbers came from their own export.

### B15 — No scenario simulation

`POST /api/v1/simulate/{dataset_id}` with lead-time / demand / service-level / MOQ
multipliers and a capacity cap, returning the same engine run under different inputs. Shape:
`ScenarioInput` → `ScenarioOutcome`. It must be the same engine, not a second model that
could disagree with the first.

---

## 5. Smaller notes for the backend

- **`history_start` / `history_end` are naive datetimes** (`"2024-01-01 00:00:00"`), not
  ISO-8601. `new Date()` does not parse that; the adapter patches the space to a `T`. Please
  send ISO-8601 with an offset, per the integration doc.
- **`wape` is a fraction** (`0.4185`) while the doc says percentages go as `11.4`. The
  adapter multiplies by 100. Pick one and apply it everywhere.
- **`recommended_qty` is an unrounded float** (`4913.969049992939`). Units are discrete;
  the adapter rounds. MOQ rounding should happen in the engine anyway.
- **`GET /api/v1/value/{id}` 404s before a forecast has run.** Correct, but the message
  ("no simulation yet — run a forecast first") is good enough to show a user — keep it.
- **CORS allows `localhost:3000`.** Not needed any more: every call is server-to-server now.
  Worth removing, since the browser should never reach this service directly.
- **No auth on the backend at all.** Fine while it is only reachable from this app's server.
  Before it is deployed anywhere the browser can reach, it needs at least a shared secret —
  `architecture.md` §"Not building" says "auth beyond a demo key", and this is the moment
  that demo key starts mattering.

---

## 6. How to run the whole thing

```bash
# 1. backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DISABLE_TIMESFM=1 .venv/bin/python -m uvicorn app.main:app --port 8000

# 2. frontend
npm run dev                          # reads BACKEND_API_URL, default http://localhost:8000

# 3. data to upload
python3 scripts/generate_dataset.py  # data/generated/penjualan_abc_distribution.csv
```

Sign in as `sari.wijaya@gmail.com` / `owner1234`. The demo accounts and the seeded branch
network are **unchanged and still fixture-backed on purpose** — they are how the auth flow
is tested without a running backend. See `auth/README.md`.

Checks:

```bash
npm run check:auth       # 28 assertions, auth layer
npm run check:fixtures   # 13 assertions, fixture invariants
npm run lint && npm run build
```

---

## 7. Suggested order of work

1. **B1** — history. Unblocks B9, B10 and every chart. Nothing else comes close.
2. **B11** — `location_id` filtering. It is a security boundary, and it is a query param.
3. **B6** — display names. Cheap; the columns are already in the uploaded file.
4. **B5** — inventory position as named fields. Removes the regex scraping.
5. **B9** — overview, once B1 exists.
6. **B4, B8** — vocabulary and stage enums. Small, and they stop silent breakage.
7. Everything else.

B2, B3, B4, B6 and B8 are all shape changes to responses that already exist — they are
plumbing, not new computation, and together they would take most of the `—` marks off the
screen.
