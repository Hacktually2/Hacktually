Boleh. Kalau dibikin lebih detail tapi tetap **realistis untuk 24 jam/3 orang**, aku akan treat sistem kalian sebagai **forecasting platform dengan satu canonical core**, lalu semua metode input/output cuma adapter di sekeliling core itu.

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT / ENTERPRISE                          │
│                                                                     │
│  Manual CSV      ERP/POS/WMS API      Scheduled export / webhook    │
│      │                 │                         │                   │
└──────┼─────────────────┼─────────────────────────┼───────────────────┘
       │                 │                         │
       ▼                 ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       1. INGESTION LAYER                            │
│                                                                     │
│  POST /ingest/csv                                                   │
│  POST /ingest/json                                                  │
│  POST /forecast                                                     │
│                                                                     │
│  Tasks:                                                             │
│  • validate file/request                                            │
│  • create job_id                                                    │
│  • store raw input                                                  │
│  • extract basic metadata                                           │
│  • send job to processing pipeline                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 2. DATA PROFILING / SCHEMA LAYER                   │
│                                                                     │
│  Example incoming columns:                                          │
│                                                                     │
│  tgl_order | kode_brg | qty_out | cabang | disc                    │
│                                                                     │
│  Profiler detects:                                                  │
│  • dtype                                                             │
│  • cardinality                                                       │
│  • sample values                                                     │
│  • null ratio                                                        │
│  • datetime candidates                                               │
│  • numeric candidates                                                │
│  • ID/categorical candidates                                         │
│                                                                     │
│                  ↓                                                   │
│                                                                     │
│  SEMANTIC MAPPER                                                     │
│  deterministic rules + optional LLM                                 │
│                                                                     │
│  tgl_order → timestamp                                               │
│  kode_brg  → item_id                                                 │
│  qty_out   → target                                                  │
│  cabang    → location_id                                             │
│  disc      → promotion                                               │
│                                                                     │
│  Returns confidence + asks user to confirm important mappings        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     3. CANONICAL DATA MODEL                         │
│                                                                     │
│  Every company becomes the SAME internal representation             │
│                                                                     │
│  timestamp                                                          │
│  series_id                                                          │
│  target                                                             │
│                                                                     │
│  optional:                                                          │
│  item_id                                                            │
│  location_id                                                        │
│  inventory                                                          │
│  price                                                              │
│  promotion                                                          │
│  category                                                           │
│  lead_time                                                          │
│  MOQ                                                                │
│                                                                     │
│  series_id can be:                                                  │
│  item_id + location_id                                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    4. DATA QUALITY ENGINE                           │
│                                                                     │
│  Deterministic processing — NOT LLM                                 │
│                                                                     │
│  duplicate rows        → aggregate/remove                           │
│  missing timestamps    → reconstruct time index                     │
│  irregular intervals   → normalize frequency                        │
│  missing demand        → rule-based handling                         │
│  negative demand       → flag as return / invalid                   │
│  extreme values        → anomaly flag                               │
│  short history         → forecastability warning                    │
│  sparse demand         → sparsity flag                              │
│                                                                     │
│                     ↓                                               │
│                                                                     │
│                DATA HEALTH REPORT                                   │
│                                                                     │
│  Health score: 82/100                                               │
│  Frequency: daily                                                   │
│  History: 21 months                                                 │
│  Series: 428 SKU-location                                           │
│  Missing: 1.3%                                                      │
│  Duplicate rows: 17                                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 5. FORECASTABILITY CHECK                            │
│                                                                     │
│  Does this series have enough usable data?                          │
│                                                                     │
│  YES → continue                                                     │
│  NO  → mark as "insufficient data"                                  │
│                                                                     │
│  Avoid forcing a forecast when it doesn't make sense                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 6. DEMAND PATTERN CLASSIFIER                        │
│                                                                     │
│                       ADI + CV²                                     │
│                                                                     │
│                  ┌──── Smooth                                       │
│                  ├──── Erratic                                      │
│   each series ───┼──── Intermittent                                 │
│                  └──── Lumpy                                        │
│                                                                     │
│  This classification DOES NOT automatically choose the model.       │
│  It determines which models should be evaluated.                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    7. MODEL ROUTER                                  │
│                                                                     │
│  Smooth / Erratic:                                                  │
│      TimesFM                                                        │
│      Seasonal Naive                                                 │
│                                                                     │
│  Intermittent / Lumpy:                                              │
│      TimesFM                                                        │
│      Croston                                                        │
│      TSB                                                            │
│      Seasonal Naive                                                 │
│                                                                     │
│                    ZERO TRAINING                                    │
│                                                                     │
│  Optional covariates for TimesFM if available:                      │
│  price, promotion, holiday/calendar, etc.                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   8. BACKTEST ENGINE                                │
│                                                                     │
│        Historical data                                              │
│              │                                                      │
│       ┌──────┴──────┐                                               │
│       │ train       │ validation                                    │
│       └─────────────┘                                               │
│              ↓                                                      │
│       candidate forecasts                                           │
│              ↓                                                      │
│                                                                     │
│  Compare:                                                           │
│  • WAPE                                                             │
│  • bias                                                             │
│  • optional MASE                                                    │
│                                                                     │
│                 ↓                                                   │
│                                                                     │
│  Select best VALIDATED model PER SERIES                             │
│                                                                     │
│  SKU-001/Jakarta → TimesFM                                          │
│  SKU-002/Jakarta → TSB                                              │
│  SKU-003/Bandung → Seasonal Naive                                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   9. FINAL FORECAST ENGINE                          │
│                                                                     │
│  Re-run selected method using full available history                │
│                                                                     │
│  Output:                                                            │
│                                                                     │
│  timestamp | series_id | forecast | lower | upper                   │
│                                                                     │
│  + model_used                                                       │
│  + historical backtest score                                        │
│  + demand_class                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    10. DECISION ENGINE                              │
│                                                                     │
│             FORECAST                                                │
│                +                                                    │
│             INVENTORY                                               │
│                +                                                    │
│             LEAD TIME                                               │
│                +                                                    │
│                MOQ                                                  │
│                │                                                    │
│                ▼                                                    │
│                                                                     │
│  • stockout risk                                                    │
│  • days until projected stockout                                    │
│  • suggested reorder                                                │
│  • priority SKU                                                     │
│                                                                     │
│  IMPORTANT:                                                         │
│  missing business parameter → ask user / return recommendation only │
│  never invent missing inventory data                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴──────────────────┐
              │                                   │
              ▼                                   ▼
┌────────────────────────┐          ┌──────────────────────────────┐
│ 11A. DASHBOARD         │          │ 11B. SERVICE INTERFACE      │
│                        │          │                              │
│ Data health            │          │ REST API                     │
│ Forecast chart         │          │ MCP server                   │
│ Demand segmentation    │          │                              │
│ Model selection        │          │ get_forecast()               │
│ Stockout alerts        │          │ get_stockout_risk()          │
│ Reorder recommendation │          │ get_reorder()                │
└────────────────────────┘          │ get_data_health()             │
                                    └──────────────┬───────────────┘
                                                   │
                              ┌────────────────────┴────────────┐
                              ▼                                 ▼
                       AI assistant                           Slack
```

## 1. Ingestion: CSV dan API harus first-class citizen

Ini penting. Jangan arsitekturnya:

```text
CSV → special pipeline
API → another pipeline
```

Harus:

```text
                    INPUT ADAPTERS

CSV upload ─────────────┐
                       │
JSON API ───────────────┼──→ RAW DATA OBJECT
                       │
ERP connector someday ─┘
                              ↓
                     SAME CORE PIPELINE
```

Jadi CSV sebenarnya hanya **salah satu transport mechanism**.

Hackathon API kalian cukup punya contract seperti:

```http
POST /api/v1/ingest/csv
```

untuk file:

```text
sales.csv
```

atau:

```http
POST /api/v1/ingest/json
```

dengan:

```json
{
  "source": "erp",
  "records": [
    {
      "transaction_date": "2026-08-01",
      "product_code": "ABC123",
      "branch": "JKT01",
      "qty_out": 125,
      "inventory": 300
    }
  ]
}
```

Kedua request menghasilkan:

```json
{
  "job_id": "forecast_abc123",
  "status": "profiling"
}
```

Kemudian frontend bisa polling:

```http
GET /api/v1/jobs/forecast_abc123
```

Ini membuat architecture terasa jauh lebih production-ready tanpa coding terlalu banyak.

---

# 2. Schema adapter adalah bagian terpenting produk

Misalnya customer A punya:

```text
tgl
sku
qty
gudang
```

Customer B:

```text
invoice_date
product_code
units_sold
branch_id
```

Customer C:

```text
Date
Item No
Quantity Out
Warehouse
```

Internal pipeline **tidak boleh care**.

Semua harus menjadi:

```text
timestamp
item_id
location_id
target
```

Contohnya:

```json
{
  "timestamp": "invoice_date",
  "item_id": "product_code",
  "location_id": "branch_id",
  "target": "units_sold"
}
```

Schema mapping bisa pakai dua stages:

```text
RULE-BASED
dtype
column names
cardinality
statistics
sample values
       ↓
if ambiguous
       ↓
LLM SEMANTIC MAPPING
```

Jangan kasih full CSV ke LLM.

Kirim metadata saja:

```json
{
  "column": "qty_out",
  "dtype": "integer",
  "sample": [12, 25, 9, 31],
  "min": 0,
  "max": 840,
  "null_ratio": 0.001
}
```

Much cheaper, faster, dan safer.

---

# 3. Human confirmation sebelum pipeline lanjut

UI:

```text
We detected your dataset:

Date            transaction_date    99%
Product         kode_barang         97%
Demand          qty_out             95%
Location        branch              93%
Inventory       stock_on_hand       91%

[ Confirm Mapping ]
```

Kalau salah:

```text
Demand:
[ qty_out ▼ ]
```

user bisa override.

Ini memberikan kalian dua keuntungan sekaligus:

```text
AI automation
+
enterprise reliability
```

---

# 4. Canonical schema jangan terlalu complicated

Untuk hackathon, cukup:

```python
timestamp
series_id
target

# optional
item_id
location_id
inventory
price
promo
lead_time
moq
```

Contohnya:

```text
timestamp   series_id       target inventory promo
2026-01-01  ABC-JKT         120    500       0
2026-01-02  ABC-JKT         143    380       1
2026-01-03  ABC-JKT         118    237       0
```

`series_id` kalian bisa generate:

```python
series_id = item_id + "__" + location_id
```

Kalau gak ada location:

```python
series_id = item_id
```

---

# 5. Data Cleaning Engine

Aku akan sangat menghindari “AI cleans data.”

Lebih credible:

```text
AI understands semantics.
Code cleans data.
```

Pipeline:

```text
raw canonical data
       ↓
sort timestamp
       ↓
remove / aggregate duplicates
       ↓
detect frequency
       ↓
reindex timestamps
       ↓
handle missing values
       ↓
flag negatives
       ↓
flag anomalies
       ↓
check history length
       ↓
clean forecasting dataset
```

Dan setiap transformation disimpan dalam report:

```json
{
  "rows_received": 154239,
  "duplicates_found": 193,
  "missing_timestamps": 82,
  "negative_values": 7,
  "series_removed": 11,
  "forecastable_series": 417
}
```

UI:

```text
DATA HEALTH

82 / 100

✓ Daily frequency detected
✓ 428 series detected
⚠ 193 duplicate records
⚠ 82 missing timestamps
⚠ 11 series have insufficient history
```

Ini actually bisa jadi salah satu screen paling convincing di demo.

---

# 6. Demand segmentation

Per:

```text
SKU × location
```

calculate:

```text
ADI
CV²
```

Output:

```json
{
  "series_id": "ABC__JKT",
  "adi": 1.08,
  "cv2": 0.21,
  "demand_type": "smooth"
}
```

Kemudian dashboard:

```text
DEMAND PORTFOLIO

Smooth         48%
Erratic        27%
Intermittent   18%
Lumpy           7%
```

Ini juga memberi user insight bahkan sebelum forecasting.

---

# 7. Forecast model router

Jangan bikin satu gigantic model function.

Bikin adapter abstraction:

```python
class ForecastModel:
    def fit_predict(history, horizon):
        ...
```

Implement:

```text
TimesFMAdapter
SeasonalNaiveAdapter
CrostonAdapter
TSBAdapter
```

Kemudian orchestrator:

```python
candidates = model_router(demand_type)

for model in candidates:
    forecast = model.forecast(...)
    score = backtest(...)
```

Dengan demikian TimesFM bukan tightly coupled.

Hari ini:

```text
TimesFM
```

besok bisa:

```text
Chronos
commercial foundation model
custom model
```

tanpa rewrite sistem.

---

# 8. Jangan backtest semua SKU × semua model × banyak folds

Ini salah satu scope trap terbesar.

Kalau ada:

```text
1,000 series
×
4 models
×
10 folds
```

jadi 40,000 forecasting runs.

Untuk hackathon cukup:

```text
1–3 backtest windows
```

Misalnya:

```text
historical
────────────────────────────────────────────

train                validate
████████████████████ ████

      train                validate
      ████████████████████ ████
```

Metrics:

```text
WAPE
bias
```

Model selection:

```text
lowest WAPE
+
bias within acceptable threshold
```

Contoh:

```text
SKU A

TimesFM
WAPE 12.8%
Bias +1.9%

TSB
WAPE 19.1%
Bias -5.2%

Seasonal Naive
WAPE 23.4%

→ SELECT TimesFM
```

---

# 9. Result storage

Jangan recompute setiap dashboard refresh.

Store output.

Database sederhana:

```text
datasets
jobs
series_profiles
forecasts
recommendations
```

Contoh:

```text
datasets
──────────────
dataset_id
filename
created_at
schema_mapping
health_score
```

```text
forecasts
──────────────
forecast_id
job_id
series_id
timestamp
forecast
lower_bound
upper_bound
model_name
wape
bias
```

```text
recommendations
──────────────
series_id
stockout_risk
days_until_stockout
recommended_order_qty
reason
```

SQLite udah cukup.

Kalau mau kelihatan more production-ish:

```text
PostgreSQL
```

tapi **SQLite lebih aman untuk hackathon**.

---

# 10. Inventory decision engine

Jangan langsung:

```text
forecast = 10,000
→ order 10,000
```

Decision layer harus ngerti context.

Minimal:

```text
forecast over lead-time period
+
safety buffer
-
current usable inventory
```

kemudian rounding:

```text
MOQ
```

Conceptually:

```text
Projected demand during lead time = 4,200
Safety stock                    =   800
Current inventory               = 1,700

Required stock                  = 5,000

Raw reorder:
5,000 - 1,700 = 3,300

MOQ = 500

Recommended order:
3,500 units
```

UI harus transparan:

```text
Recommended order
3,500 units

Why?
────────────────────────
Demand during lead time   4,200
Safety buffer               800
Current stock            -1,700
MOQ adjustment             +200
```

Itu membuat AI tidak terasa seperti black box.

---

# 11. REST API untuk output juga penting

Jangan cuma input API.

Enterprise software harus bisa **consume results**.

Misalnya:

```http
GET /api/v1/forecast/ABC123
```

response:

```json
{
  "sku": "ABC123",
  "location": "JKT01",
  "model": "timesfm",
  "forecast_horizon": 30,
  "expected_demand": 8420,
  "backtest_wape": 0.128
}
```

Kemudian:

```http
GET /api/v1/recommendations/ABC123
```

```json
{
  "stockout_risk": "high",
  "days_until_stockout": 8,
  "recommended_order": 5000
}
```

Sekarang ERP/company system bisa:

```text
ERP
 ↓
your API
 ↓
forecast
 ↓
ERP dashboard
```

tanpa dashboard kalian sama sekali.

---

# 12. MCP layer

MCP **wraps the same backend API**.

Jangan kasih MCP access langsung ke DB/TimesFM.

```text
MCP Server
    ↓
FastAPI
    ↓
Forecasting platform
```

Tools:

```text
get_data_health(dataset_id)

get_forecast(
    sku,
    location,
    horizon
)

get_stockout_risk(
    location
)

get_reorder_recommendation(
    sku,
    location
)
```

Jadi AI assistant bisa:

> Which products need immediate action?

MCP:

```text
get_stockout_risk()
```

returns:

```text
12 high-risk products
```

User:

> What's the worst one?

MCP:

```text
get_reorder_recommendation("ABC123")
```

returns reasoning.

---

# 13. Slack integration

Untuk hackathon, jangan bikin Slack OAuth app kalau waktunya sempit.

Pakai:

```text
Incoming webhook
```

Flow:

```text
Recommendation engine
        ↓
Slack adapter
        ↓
#procurement
```

Message:

```text
⚠ STOCKOUT RISK

SKU: ABC-123
Warehouse: Jakarta
Projected stockout: 8 days

Forecast demand: 8,420 units
Current inventory: 4,100 units

Recommended reorder:
5,000 units

Model: TimesFM
Historical WAPE: 12.8%
```

Untuk demo bahkan bisa trigger lewat AI:

> Send this recommendation to procurement.

↓

```text
send_procurement_alert()
```

↓

Slack notification.

---

# 14. Full backend structure

Aku akan organize repository kira-kira:

```text
/backend
│
├── api/
│   ├── ingestion.py
│   ├── forecast.py
│   └── recommendations.py
│
├── ingestion/
│   ├── csv_adapter.py
│   └── json_adapter.py
│
├── schema/
│   ├── profiler.py
│   ├── mapper.py
│   └── canonical.py
│
├── cleaning/
│   ├── validation.py
│   └── cleaning.py
│
├── segmentation/
│   └── adi_cv2.py
│
├── forecasting/
│   ├── timesfm.py
│   ├── seasonal_naive.py
│   ├── croston.py
│   ├── tsb.py
│   └── router.py
│
├── evaluation/
│   └── backtest.py
│
├── inventory/
│   └── reorder.py
│
├── integrations/
│   ├── slack.py
│   └── mcp.py
│
└── main.py
```

Frontend:

```text
/frontend
│
├── upload
├── mapping
├── data-health
├── forecast
└── recommendations
```

---

# 15. Deployment hackathon

Aku tidak akan Kubernetes.

Run:

```text
┌────────────────────────────────────────┐
│            L40S SERVER                 │
│                                        │
│  Docker Compose                        │
│                                        │
│  frontend                              │
│      │                                 │
│      ▼                                 │
│  FastAPI backend                       │
│      │                                 │
│      ├── CPU preprocessing             │
│      ├── baseline models               │
│      │                                 │
│      └── TimesFM → GPU L40S            │
│                                        │
│  SQLite/Postgres                       │
│                                        │
│  MCP server                            │
│                                        │
└────────────────────────────────────────┘
```

Production story baru:

```text
Docker
 ↓
Kubernetes / Cloudeka
 ↓
Deka GPU
 ↓
LAMPU distribution
```

Jangan habiskan hackathon melakukan production infra yang juri bahkan tidak akan lihat.

---

# Yang sebenarnya kalian bangun

Kalau diringkas, architecture kalian punya **empat adaptive layers**:

| Layer                   | Pertanyaan yang dijawab                                          |
| ----------------------- | ---------------------------------------------------------------- |
| **Data adaptation**     | “Data perusahaan ini bentuknya gimana?”                          |
| **Demand adaptation**   | “Demand SKU ini behaving seperti apa?”                           |
| **Model adaptation**    | “Model mana yang historically paling cocok?”                     |
| **Workflow adaptation** | “Perusahaan mau consume hasilnya lewat dashboard, API, atau AI?” |

Dan itu menghasilkan flow yang menurutku paling clean untuk deck:

```text
          ANY ENTERPRISE DATA
                  │
          CSV / API / ERP
                  ↓
          ┌───────────────┐
          │ Schema Adapter│
          └───────┬───────┘
                  ↓
          Canonical Data Model
                  ↓
          Data Quality Engine
                  ↓
          Demand Intelligence
           ADI + CV²
                  ↓
          Adaptive Model Router
        ┌─────────┼─────────┐
        ↓         ↓         ↓
     TimesFM   Croston     TSB
        └─────────┼─────────┘
                  ↓
          Historical Backtest
                  ↓
        Best Validated Forecast
                  ↓
          Inventory Decision
                  ↓
       ┌──────────┼──────────┐
       ↓          ↓          ↓
  Dashboard      API        MCP
                             ↓
                       Slack / AI
```

Dan satu detail yang menurutku penting untuk positioning: **jangan bilang “AI decides the best model.”** Bilang:

> **“AI adapts the incoming enterprise schema; deterministic diagnostics characterize demand; historical backtesting validates the forecasting method.”**

Itu terdengar jauh lebih technically mature, karena kalian jelas membedakan mana semantic AI reasoning, mana statistik, dan mana deterministic business logic.

Untuk **3 orang × 24 jam**, aku akan menetapkan hard MVP boundary di: **CSV/API ingestion → schema mapping → cleaning → ADI/CV² → TimesFM + 2–3 lightweight baselines → limited backtest → forecast → reorder → dashboard**. **MCP + Slack masuk sebagai bonus integration setelah jalur itu stabil.**



---

For **3 people × 24 hours**, aku akan pilih stack yang boring, fast, dan minim infra supaya waktu kalian habis di product logic, bukan deployment.

| Layer                | Pilihan                                         | Kenapa                                                                       |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Frontend             | **Next.js + TypeScript + Tailwind + shadcn/ui** | Cepat bikin UI yang kelihatan enterprise/polished                            |
| Backend              | **FastAPI + Python**                            | Semua forecasting/data science kalian Python, jadi nggak perlu bridge bahasa |
| Data processing      | **Polars**                                      | Lebih cepat dan memory-efficient daripada pandas untuk CSV besar             |
| Schema profiling     | **Polars + custom rules**                       | dtype, null %, cardinality, samples, date detection                          |
| Semantic mapping     | **LLM API / Deka LLM kalau tersedia**           | Hanya mapping kolom ambigu, bukan cleaning                                   |
| Canonical validation | **Pydantic**                                    | Enforce schema internal kalian                                               |
| Forecasting          | **TimesFM-3**                                   | Main pretrained model                                                        |
| Baselines            | **StatsForecast / custom Python**               | Seasonal Naive, Croston, TSB                                                 |
| Backtesting          | **Custom Python + NumPy/Polars**                | Jangan install framework AutoML berat                                        |
| Database             | **SQLite**                                      | Zero setup, cukup untuk hackathon                                            |
| Raw file storage     | **Local `/data` folder**                        | Jangan tambah S3/MinIO kecuali wajib                                         |
| Inventory engine     | **Pure Python**                                 | Transparent deterministic rules                                              |
| REST integration     | **FastAPI**                                     | Input + output API                                                           |
| MCP                  | **Python MCP SDK**                              | Wrapper di atas API/service functions                                        |
| Slack                | **Incoming Webhook**                            | Paling cepat untuk demo                                                      |
| Deployment           | **Docker Compose**                              | frontend + backend + model worker                                            |
| GPU                  | **L40S**                                        | TimesFM inference                                                            |
| Charts               | **Recharts**                                    | Cocok dengan Next.js dan cepat                                               |
| Version control      | **GitHub**                                      | Obviously                                                                    |

Jadi secara high-level:

```text
                         NEXT.JS
                    Enterprise Dashboard
                           │
                           │ HTTP
                           ▼
                    ┌──────────────┐
                    │   FASTAPI    │
                    │              │
CSV Upload ────────►│ ingestion    │◄──────── JSON / ERP API
                    │ schema       │
                    │ forecast     │
                    │ decisions    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         Schema/Data    SQLite      MCP Server
           Engine                        │
              │                          ▼
              │                     AI / Slack
              ▼
           POLARS
              │
              ▼
       Canonical Dataset
              │
              ▼
        Demand Classifier
          ADI + CV²
              │
              ▼
       Forecast Orchestrator
       ┌──────┼───────┐
       ▼      ▼       ▼
   TimesFM  Croston   TSB
       │      │       │
       └──────┼───────┘
              ▼
           Backtest
              │
              ▼
        Best Forecast
              │
              ▼
       Inventory Engine
              │
              ▼
      Forecast / Reorder API
```

### Backend: Python all the way

Ini satu keputusan yang menurutku jangan kalian debat terlalu lama.

```text
Python 3.11/3.12
FastAPI
Polars
Pydantic
NumPy
TimesFM
StatsForecast
```

Jangan bikin backend Node lalu forecasting service Python kecuali kalian memang butuh. Itu cuma menambah:

```text
Node API
   ↓
Python API
   ↓
Model
```

padahal bisa:

```text
FastAPI
   ↓
Python forecasting code
```

Langsung.

Project structure-nya bisa seperti ini:

```text
backend/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── ingestion.py
│   │   ├── datasets.py
│   │   ├── forecasts.py
│   │   └── recommendations.py
│   │
│   ├── schema/
│   │   ├── profiler.py
│   │   ├── mapper.py
│   │   └── canonical.py
│   │
│   ├── cleaning/
│   │   └── pipeline.py
│   │
│   ├── demand/
│   │   └── classifier.py
│   │
│   ├── forecasting/
│   │   ├── timesfm.py
│   │   ├── naive.py
│   │   ├── croston.py
│   │   ├── tsb.py
│   │   └── router.py
│   │
│   ├── evaluation/
│   │   └── backtest.py
│   │
│   ├── inventory/
│   │   └── reorder.py
│   │
│   ├── integrations/
│   │   ├── slack.py
│   │   └── mcp.py
│   │
│   └── db/
│       └── database.py
```

Yang bagus dari structure ini: **TimesFM cuma satu adapter**.

Misalnya:

```python
class ForecastModel:
    def forecast(self, series, horizon):
        raise NotImplementedError
```

lalu:

```python
class TimesFMModel(ForecastModel):
    ...

class CrostonModel(ForecastModel):
    ...

class SeasonalNaiveModel(ForecastModel):
    ...
```

Model router kalian tinggal melakukan:

```python
models = router.get_candidates(demand_type)

for model in models:
    prediction = model.forecast(...)
    score = backtest(...)
```

Jauh lebih maintainable daripada forecasting logic bercampur di endpoint FastAPI.

### Polars, bukan pandas

Untuk hackathon biasa aku sering bilang pandas cukup. Tapi kalian secara eksplisit menjual:

> “Upload enterprise CSV.”

Jadi pakai **Polars** akan membantu kalau dikasih dataset lumayan besar.

Contohnya:

```python
import polars as pl

df = pl.read_csv("sales.csv")
```

Kalian bisa cepat dapat:

```text
row count
null %
unique values
dtype
min/max
duplicates
```

untuk data profiler.

Dan nanti pitch kalian bisa bilang ingestion layer dirancang untuk dataset besar tanpa perlu claim berlebihan.

### SQLite > PostgreSQL untuk hackathon

Aku akan sangat strongly pilih:

```text
SQLite
```

untuk 24 jam.

Bukan karena PostgreSQL jelek, tapi kalian nggak memperoleh nilai hackathon berarti dari:

```text
database networking
credentials
container health
migrations
persistent volume
```

Database kalian cuma perlu menyimpan:

```text
datasets
jobs
schema mappings
series metadata
forecasts
recommendations
```

SQLite bisa handle itu.

Misalnya:

```text
forecast.db
```

dan selesai.

Kalau masuk accelerator:

```text
SQLite → PostgreSQL
```

mudah.

### Jangan pakai Celery/Redis dulu

Forecast job kemungkinan tidak instant, jadi technically background job memang bagus.

Tapi jangan langsung:

```text
FastAPI
 ↓
Redis
 ↓
Celery
 ↓
Worker
```

Itu 3 moving parts lagi.

Untuk hackathon, cukup:

```text
POST /forecast
      ↓
create job_id
      ↓
FastAPI BackgroundTask
      ↓
job status saved SQLite
```

Frontend polling:

```text
GET /jobs/{job_id}
```

response:

```json
{
  "status": "forecasting",
  "progress": 72
}
```

Kalau sudah:

```json
{
  "status": "completed"
}
```

Untuk production baru pindah ke proper queue.

### Frontend: Next.js kalau ada satu orang yang comfortable

Aku pilih:

```text
Next.js
TypeScript
Tailwind
shadcn/ui
Recharts
```

karena UI kalian memang penting.

Flow-nya bisa seperti:

```text
/upload
   ↓
/mapping
   ↓
/data-health
   ↓
/forecast
   ↓
/recommendations
```

Dan bikin satu dashboard:

```text
┌─────────────────────────────────────────────┐
│ Dataset: PT ABC Sales                      │
│ Data Health 82/100                         │
├────────────────────┬────────────────────────┤
│ Demand Types       │ Model Selection        │
│                    │                        │
│ Smooth 51%         │ TimesFM 63%            │
│ Erratic 23%        │ TSB 21%                │
│ Intermittent 18%   │ Croston 10%            │
│ Lumpy 8%           │ Naive 6%               │
├────────────────────┴────────────────────────┤
│ Forecast chart                              │
├─────────────────────────────────────────────┤
│ ⚠ 12 SKU at stockout risk                  │
│                                             │
│ SKU ABC123 — reorder 5,000 units            │
└─────────────────────────────────────────────┘
```

Kalau **nggak ada seorang pun yang comfortable React**, jangan maksa.

Use:

```text
Streamlit
```

Seriously.

Better ada polished-enough working app daripada 8 jam habis debug React state.

Tapi kalau salah satu dari kalian memang web dev, **Next.js wins** karena product kalian jadi kelihatan jauh lebih commercial.

### Schema understanding: hybrid, jangan full LLM

Aku akan bikin:

```text
Polars profiler
      ↓
rule-based detection
      ↓
LLM only when ambiguous
```

Misalnya obvious:

```text
date → timestamp
sales_quantity → target
```

nggak perlu LLM.

Tapi:

```text
qty_out
movement
net_disp
```

bisa dikirim ke LLM bersama metadata.

LLM return:

```json
{
  "column": "qty_out",
  "role": "target",
  "confidence": 0.94
}
```

Lalu frontend user confirm.

Jika Lintasarta memberi akses Deka LLM, layer ini adalah tempat paling natural menggunakannya.

### TimesFM process

Karena kalian punya L40S, ideally model load **sekali saat server start**.

Jangan:

```python
@app.post("/forecast")
def forecast():
    model = load_timesfm()   # BAD
```

karena setiap request load checkpoint lagi.

Better:

```text
Backend boot
   ↓
load TimesFM
   ↓
GPU memory stays allocated
   ↓
requests use existing model
```

Bahkan bisa punya:

```text
FastAPI
   ↓
ForecastService
   ↓
TimesFM singleton
```

Untuk hackathon itu sudah cukup.

### MCP

MCP server jangan contain forecasting logic.

Strukturnya:

```text
AI Client
   ↓
MCP Server
   ↓
your service/API
```

Tools:

```python
get_forecast(...)
get_stockout_risk(...)
get_reorder_recommendation(...)
get_data_health(...)
```

Internally mereka cuma call existing service functions.

Jadi MCP adalah **interface layer**, bukan duplicate backend.

### Slack

Hackathon version:

```text
Slack Incoming Webhook
```

Jangan OAuth app unless you're already done.

Environment variable:

```text
SLACK_WEBHOOK_URL=...
```

Python:

```python
requests.post(
    SLACK_WEBHOOK_URL,
    json={"text": message}
)
```

Done.

Demo udah cukup convincing.

### Docker

Satu `docker-compose.yml`:

```text
services:

frontend
    Next.js
    port 3000

backend
    FastAPI
    port 8000
    GPU access
    mounted ./data
```

SQLite bisa tinggal:

```text
./data/app.db
```

Jadi bahkan sebenarnya **dua containers cukup**.

Kalau TimesFM dependency bentrok dengan backend baru pecah:

```text
frontend
backend
forecast-worker
```

Tapi default-ku jangan pecah dulu.

### Jangan pakai ini selama 24 jam

Aku specifically akan avoid **Kubernetes, Kafka, Airflow, Spark, Ray, MLflow, feature store, vector database, Redis/Celery kecuali absolutely needed, microservice architecture, full ERP integration, dan custom model training**.

Semua teknologi itu bisa dibenarkan untuk production. Tapi untuk hackathon, mereka mostly menghasilkan diagram keren + bugs.

Pitch production architecture boleh:

```text
Hackathon                     Production

SQLite              →        PostgreSQL
local files         →        Object Storage
BackgroundTasks     →        Queue/workers
Docker Compose      →        Kubernetes
single GPU          →        autoscaled Deka GPU
CSV/API             →        ERP/POS/WMS connectors
Slack webhook       →        enterprise integrations
```

Itu justru menunjukkan kalian tahu **bedanya prototype architecture dan production architecture**.

Dan kalau aku freeze stack kalian sekarang, pilihanku adalah:

> **Next.js + Tailwind/shadcn → FastAPI → Polars/Pydantic → TimesFM + StatsForecast → SQLite → Python MCP SDK + Slack webhook → Docker Compose → NVIDIA L40S.**

Satu stack, satu language untuk seluruh intelligence layer, sedikit dependencies, dan cukup lengkap untuk menunjukkan **CSV/API → adaptive forecasting → validated model → inventory decision → API/MCP/Slack** dalam 24 jam.
