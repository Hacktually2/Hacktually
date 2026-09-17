"""FastAPI entrypoint.

Run: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from .api.routes import router
from . import security
from .db import database as db
from .evaluation import fast_backtest
from .integrations import notify
from .forecasting.router import available_model_names, foundation_status

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    notify.init()
    warning = security.startup_warning()
    if warning:
        log.warning(warning)
    else:
        log.info(
            "API key required; tenant isolation %s",
            "on" if security.tenancy_enabled() else "off",
        )
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

# No CORS. Every call is server-to-server: the frontend proxies reads through a
# Server Component or Server Action that has already checked branch access, and
# this service has no authentication of its own. Allowing a browser origin would
# mean the one control protecting the data is that nobody knows the address.


@app.middleware("http")
async def guard(request: Request, call_next):
    """One gate in front of everything, so no route can forget it.

    Checks the shared key, then that every dataset named in the path belongs to
    the tenant making the request. Both are no-ops until BACKEND_API_KEY is set.
    """
    path = request.url.path
    if path in security.OPEN_PATHS:
        return await call_next(request)

    try:
        security.check_key(request)
        if security.tenancy_enabled():
            claimed = security.tenant_of(request)
            for dataset_id in security.dataset_ids_in_path(path):
                security.assert_tenant(_owner_of_dataset(dataset_id), claimed)
            for job_id in security.job_ids_in_path(path):
                security.assert_tenant(_owner_of_job(job_id), claimed)
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    return await call_next(request)


def _owner_of_dataset(dataset_id: str) -> str | None:
    row = db.query_one("SELECT tenant_id FROM datasets WHERE dataset_id = ?", (dataset_id,))
    # An id that does not exist is left to the route, which answers 404 with a
    # message. Refusing here would make a typo indistinguishable from a breach.
    return row["tenant_id"] if row else None


def _owner_of_job(job_id: str) -> str | None:
    row = db.query_one(
        """SELECT d.tenant_id FROM jobs j JOIN datasets d ON d.dataset_id = j.dataset_id
           WHERE j.job_id = ?""",
        (job_id,),
    )
    return row["tenant_id"] if row else None


app.include_router(router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "auth": {
            "api_key_required": security.auth_enabled(),
            "tenant_isolation": security.tenancy_enabled(),
        },
        "models_available": available_model_names(),
        "foundation_models": foundation_status(),
        # Visible on the status endpoint on purpose. A service validating on a
        # sample should never be something you have to read the code to find out.
        "mock_mode": fast_backtest.mock_enabled(),
    }
