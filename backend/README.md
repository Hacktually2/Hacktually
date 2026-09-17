# Backend — Adaptive Demand Forecasting

FastAPI + Polars + SQLite. Architecture in [../architecture.md](../architecture.md), schedule in [../PLAN.md](../PLAN.md).

## Run it

```bash
py -3.11 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt

# Demo fixtures: three different CSV schemas from one underlying truth
./.venv/Scripts/python.exe scripts/make_demo_data.py

# Whole pipeline, no server needed. Run after any refactor.
./.venv/Scripts/python.exe scripts/smoke_test.py

# API
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Docs at http://localhost:8000/docs · health at http://localhost:8000/health

## Environment

Everything is optional. Nothing here is required for the core pipeline to run.

| Variable | Default | Effect |
| --- | --- | --- |
| `DISABLE_TIMESFM` | unset | `1` skips loading TimesFM entirely — useful on a laptop |
| `TIMESFM_CHECKPOINT` | `google/timesfm-3.0-pytorch` | Which checkpoint to load |
| `TIMESFM_DEVICE` | `cuda` | Set `cpu` off the L40S |
| `TIMESFM_BATCH_SIZE` | `16` | `per_core_batch_size` |
| `SLACK_WEBHOOK_URL` | unset | Without it, alerts return the payload instead of sending |
| `DATA_DIR` | `../data` | SQLite file and uploads |

**If TimesFM will not load the pipeline still runs**, on baselines only, and
`/health` reports why. That is deliberate: the demo must never depend on a
checkpoint loading.

## Smoke-testing TimesFM separately

Before wiring anything, confirm the model itself works. This is the single
highest-risk dependency in the build.

```python
from timesfm3 import TimesFM3Evaluator, ModelConfig
import numpy as np

f = TimesFM3Evaluator(ModelConfig(
    checkpoint_path="google/timesfm-3.0-pytorch",
    per_core_batch_size=16, device="cuda"))

history = np.random.gamma(2, 20, 400)
out = list(f.predict_batch(contexts=[history.reshape(1, -1)],
                           horizon=30, return_quantiles=True))
print(out[0])
```

Then try it with `past_future_covariates` before trusting the calendar path.

## Layout

```
app/
├── canonical.py        FROZEN — the data model everything speaks
├── schema/             presets (tier 1), profiler, mapper (tiers 2 and 3)
├── cleaning/           4 transforms + the health report
├── enrich/             Indonesian calendar, censored demand
├── demand/             ADI + CV² classification
├── forecasting/        base interface, baselines, TimesFM adapter, router
├── evaluation/         metrics, rolling backtest, selection rule
├── decision/           reorder, production, value simulation
├── services/           orchestration — all business logic lives here
├── integrations/       Slack, MCP
├── api/                thin REST layer over services
└── db/                 SQLite
```

The rule: **business logic lives in `services/`.** Endpoints and MCP tools only
translate arguments. That is what stops the REST and MCP views drifting apart.

## Swapping the forecasting model

Everything speaks `ForecastModel` in `forecasting/base.py`:

```python
class ForecastModel:
    name: str
    def forecast(self, history, horizon, seasonal_period, covariates, future_covariates) -> Forecast
```

To swap TimesFM for Chronos or a commercially licensed checkpoint, write one
adapter and register it in `forecasting/router.py`. Nothing else changes. That
is also the answer to the licensing question: TimesFM-3 weights are
non-commercial, weights up to 2.5 are Apache-2.0, and the interface makes the
swap a one-file change rather than an architecture.

## MCP

```bash
pip install "mcp[cli]"
py -3.11 -m app.integrations.mcp_server
```

Tool bodies are plain functions (`tool_*`) so they can be tested without a
client attached. Reads run freely; `send_procurement_alert` is a write and the
client must confirm with a human first.
