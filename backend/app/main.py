"""FastAPI entrypoint.

Run: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .db import database as db
from .integrations import notify
from .forecasting.router import available_model_names, foundation_status

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    notify.init()
    # Load foundation models once at startup, never per request. Failure is
    # survivable: the router drops whatever did not load and the pipeline still
    # runs end to end on baselines plus the calendar wrapper.
    for name, status in foundation_status().items():
        if status["available"]:
            log.info("%s ready (%s)", name, status["licence"])
        else:
            log.warning("%s unavailable: %s", name, status["error"])
    yield


app = FastAPI(
    title="Adaptive Demand Forecasting",
    version="0.1.0",
    description="Any enterprise data in, a validated forecast and an inventory decision out.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_available": available_model_names(),
        "foundation_models": foundation_status(),
    }
