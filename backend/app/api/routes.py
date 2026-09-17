"""REST API. FROZEN contract — see architecture.md.

Endpoints are thin. Every one of them delegates to the service layer, which is
also what the MCP server calls, so the two interfaces can never drift.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

from .. import security
from ..canonical import DecisionMode
from ..db import database as db
from ..decision import params as params_mod
from ..integrations import slack
from ..integrations import notify
from ..services import branches as branches_svc
from ..services import export_service
from ..services import pipeline_service as svc
from ..services import view_models as views

router = APIRouter(prefix="/api/v1")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _guard(request: Request, dataset_id: str) -> None:
    """Refuse another tenant's dataset. Called before any read or write.

    Answers 404 rather than 403 on purpose: confirming that an id exists but
    belongs to someone else is itself a disclosure.
    """
    try:
        owner = svc.tenant_of_dataset(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")
    security.assert_tenant(owner, security.tenant_of(request))


class IngestRecords(BaseModel):
    source: str = "api"
    records: list[dict]


class MappingOverrides(BaseModel):
    overrides: dict[str, str] = {}
    source_id: str | None = None


class ForecastRequest(BaseModel):
    horizon: int = 30
    use_calendar: bool = True
    mode: DecisionMode = DecisionMode.RITEL


class ReconcileRequest(BaseModel):
    codes: list[str]


class DigestRequest(BaseModel):
    dataset_id: str
    location_id: str
    # Supplied by the caller, never stored. The backend has no auth; who manages
    # which branch lives in the frontend, which checks access before calling.
    recipients: list[str] = []
    channel: str = "email"
    dry_run: bool = False


class AlertRequest(BaseModel):
    dataset_id: str
    series_ids: list[str] = []
    limit: int = 5


# ----------------------------------------------------------------- projects

@router.get("/projects")
def list_projects(request: Request):
    """Project chooser. A project is a dataset plus what was derived from it."""
    return views.projects(security.tenant_of(request))


@router.get("/projects/{project_id}")
def get_project(request: Request, project_id: str):
    try:
        dataset_id = project_id[4:] if project_id.startswith("prj-") else project_id
        _guard(request, dataset_id)
        return views.project(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="project not found")


# ---------------------------------------------------------------- ingestion

@router.post("/ingest")
async def ingest(request: Request, file: UploadFile = File(...)):
    try:
        payload = await file.read()
        return svc.ingest(
            file.filename or "upload.csv",
            payload,
            tenant_id=security.tenant_of(request),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ingest/json")
def ingest_json(request: Request, body: IngestRecords):
    if not body.records:
        raise HTTPException(status_code=400, detail="records cannot be empty")
    try:
        return svc.ingest_records(
            body.source, body.records, tenant_id=security.tenant_of(request)
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------- mapping

@router.get("/datasets/{dataset_id}/mapping")
def get_mapping(dataset_id: str):
    """Review table. Shows what was detected, how sure we are, and why."""
    try:
        return views.mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.post("/datasets/{dataset_id}/mapping")
def confirm_mapping(dataset_id: str, body: MappingOverrides):
    try:
        result = svc.confirm_mapping(dataset_id, body.overrides, body.source_id)
        svc.prepare(dataset_id)
        result["health"] = views.health(dataset_id)
        return result
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/datasets/{dataset_id}/append")
async def append_branch(
    dataset_id: str,
    file: UploadFile = File(...),
    branch_label: str | None = None,
):
    """Add another branch's export to an existing dataset.

    Each branch keeps its own column mapping, so Jakarta on Accurate and
    Surabaya on Jubelio can both upload without either changing anything.
    """
    try:
        payload = await file.read()
        return svc.append_source(
            dataset_id, file.filename or "branch.csv", payload, branch_label
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/sources")
def list_sources(dataset_id: str):
    return {"dataset_id": dataset_id, "sources": svc.list_sources(dataset_id)}


@router.get("/datasets/{dataset_id}/hierarchy")
def get_hierarchy(dataset_id: str):
    """Branch and network rollup. Bottom-up, so the levels always reconcile."""
    result = svc.get_hierarchy(dataset_id)
    if not result:
        raise HTTPException(status_code=404, detail="no hierarchy yet — run a forecast first")
    return result


class ParamEntry(BaseModel):
    scope: str = "category"
    scope_value: str = ""
    values: dict[str, float] = {}


class ParamsRequest(BaseModel):
    entries: list[ParamEntry]


@router.get("/datasets/{dataset_id}/params")
def get_params(dataset_id: str):
    """What is set, and what still has to be asked for.

    Lead time, MOQ and service level are commercial terms — they are not in a
    sales export, so we ask rather than guess.
    """
    return {
        "dataset_id": dataset_id,
        "current": params_mod.load_all(dataset_id),
        "suggested": params_mod.suggest(dataset_id),
    }


@router.put("/datasets/{dataset_id}/params")
def set_params(dataset_id: str, body: ParamsRequest):
    """Bulk apply. One call sets every category at once."""
    try:
        return params_mod.set_many(
            dataset_id, [entry.model_dump() for entry in body.entries]
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/health")
def get_health(dataset_id: str):
    try:
        return views.health(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/datasets")
def list_datasets(request: Request):
    """Only this tenant's datasets. Filenames alone can be commercially sensitive."""
    tenant = security.tenant_of(request)
    sql = """SELECT dataset_id, filename, created_at, preset_matched, health_score,
                    mapping_confirmed, frequency, decision_mode
             FROM datasets"""
    params: tuple = ()
    if security.tenancy_enabled():
        sql += " WHERE tenant_id IS ?"
        params = (tenant,)
    rows = db.query(sql + " ORDER BY created_at DESC LIMIT 50", params)
    return [dict(r) for r in rows]


@router.delete("/datasets/{dataset_id}")
def delete_dataset(request: Request, dataset_id: str):
    """Erase a dataset: derived rows, and the uploaded files themselves.

    Erasure that leaves the original CSV in data/uploads is not erasure.
    """
    _guard(request, dataset_id)
    try:
        return svc.purge(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/datasets/{dataset_id}/privacy")
def get_privacy(request: Request, dataset_id: str):
    """What personal data was found in the upload, and what leaves this service."""
    _guard(request, dataset_id)
    return svc.privacy_report(dataset_id)


# ---------------------------------------------------------------- forecasting

@router.post("/datasets/{dataset_id}/forecast")
def start_forecast(dataset_id: str, body: ForecastRequest, background: BackgroundTasks):
    if not db.query_one("SELECT 1 FROM datasets WHERE dataset_id = ?", (dataset_id,)):
        raise HTTPException(status_code=404, detail="dataset not found")

    db.execute(
        "UPDATE datasets SET decision_mode = ? WHERE dataset_id = ?",
        (body.mode.value, dataset_id),
    )

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    db.execute(
        """INSERT INTO jobs (job_id, dataset_id, status, progress, stage, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)""",
        (job_id, dataset_id, "running", 0, "queued", _now(), _now()),
    )

    def run() -> None:
        try:
            svc.run_forecast(dataset_id, body.horizon, job_id, body.use_calendar)
            db.execute(
                "UPDATE jobs SET status = 'completed', progress = 100, updated_at = ? WHERE job_id = ?",
                (_now(), job_id),
            )
        except Exception as exc:  # noqa: BLE001 — surface the error in job status
            db.execute(
                "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE job_id = ?",
                (str(exc), _now(), job_id),
            )

    background.add_task(run)
    return {"job_id": job_id, "status": "running"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    """Processing screen polls this. Step keys stay stable across polls."""
    try:
        return views.job(job_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="job not found")


@router.get("/forecasts/{dataset_id}")
def list_forecasts(dataset_id: str, limit: int = 100, location: str | None = None):
    sql = """SELECT s.series_id, s.item_id, s.location_id, s.demand_class, s.adi, s.cv2,
                    m.model_name, m.wape, m.mase, m.bias, m.reason
             FROM series_profiles s
             LEFT JOIN model_selection m
               ON m.dataset_id = s.dataset_id AND m.series_id = s.series_id
             WHERE s.dataset_id = ? AND s.forecastable = 1"""
    params: tuple = (dataset_id,)
    if location:
        sql += " AND s.location_id = ?"
        params = (dataset_id, location)
    rows = db.query(sql + " LIMIT ?", (*params, limit))
    return {
        "dataset_id": dataset_id,
        "model_mix": svc.model_mix(dataset_id),
        "series": [dict(r) for r in rows],
    }


@router.get("/forecasts/{dataset_id}/{series_id}")
def get_series(dataset_id: str, series_id: str):
    result = svc.get_series_forecast(dataset_id, series_id)
    if not result["forecast"]:
        raise HTTPException(status_code=404, detail="no forecast for this series")
    return result


# ----------------------------------------------------------------- branches

@router.get("/branches/{dataset_id}")
def get_branches(dataset_id: str, location: str | None = None):
    """Per-branch performance on rates, plus cross-branch transfer candidates.

    `?location=` scopes to one branch. Access is decided by the caller.
    """
    try:
        return branches_svc.insights(dataset_id, location)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/branches/{dataset_id}/list")
def list_branches(dataset_id: str):
    """Branch codes present in the data, for matching against a manager list."""
    return {"dataset_id": dataset_id, "branches": branches_svc.list_branches(dataset_id)}


@router.post("/branches/{dataset_id}/reconcile")
def reconcile_branches(dataset_id: str, body: ReconcileRequest):
    """Match supplied branch codes to the data before any access is granted.

    Returns exact matches, near-matches that need a person to confirm, and codes
    on either side with no counterpart. Grants nothing itself.
    """
    return branches_svc.reconcile(dataset_id, body.codes)


@router.get("/branches/{dataset_id}/{location_id}/summary")
def get_branch_summary(dataset_id: str, location_id: str):
    """The readable digest a branch manager would receive, without sending it."""
    try:
        return branches_svc.branch_summary(dataset_id, location_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="branch not found in this dataset")


@router.post("/notifications/branch-digest")
def send_branch_digest(body: DigestRequest):
    """Send one branch's digest. Skips silently when there is nothing new."""
    try:
        return notify.send_branch_digest(
            body.dataset_id, body.location_id, body.recipients, body.channel, body.dry_run
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="branch not found in this dataset")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/notifications/{dataset_id}/log")
def reset_notification_log(dataset_id: str, location_id: str | None = None):
    """Forget what was sent, so the next digest reports everything again."""
    notify.reset(dataset_id, location_id)
    return {"reset": True, "dataset_id": dataset_id, "location_id": location_id}


# ------------------------------------------------------------ dashboard tabs

@router.get("/overview/{dataset_id}")
def get_overview(dataset_id: str, location: str | None = None):
    """KPI row, main chart, inventory posture, ranked actions.

    `?location=` scopes the whole response to one branch. The caller decides who
    may ask for which location; this service has no auth of its own.
    """
    try:
        return views.overview(dataset_id, location)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/demand/{dataset_id}")
def get_demand(
    dataset_id: str,
    date_range: str = "18m",
    product: str = "all",
    location: str = "all",
    compare: str = "forecast",
):
    """Demand & Sales tab. Filtering happens here, never in the browser."""
    try:
        return views.demand(dataset_id, date_range, product, location, compare)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


# ---------------------------------------------------------------- decisions

@router.get("/recommendations/{dataset_id}")
def get_recommendations(
    dataset_id: str,
    risk: str = "all",
    location: str = "all",
    category: str = "all",
):
    """Supply Chain tab. `risk=attention` means critical or at_risk."""
    try:
        return views.supply_chain(dataset_id, risk, location, category)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/value/{dataset_id}")
def get_value(dataset_id: str):
    result = views.value(dataset_id)
    if not result:
        raise HTTPException(status_code=404, detail="no simulation yet — run a forecast first")
    return result


@router.get("/usage/{dataset_id}")
def get_usage(dataset_id: str):
    """Metering. LAMPU bills on consumption, so we count what we would bill."""
    return svc.get_usage(dataset_id)


@router.get("/export/{dataset_id}/{kind}")
def export_csv(
    request: Request,
    dataset_id: str,
    kind: str,
    delimiter: str = ";",
    location: str | None = None,
):
    """Download results as CSV.

    Default delimiter is ';' because Excel on an Indonesian locale reads that,
    not ','. Pass delimiter=, for pandas and friends.
    """
    if kind not in export_service.EXPORTS:
        raise HTTPException(
            status_code=404,
            detail=f"unknown export '{kind}'. Available: {', '.join(export_service.EXPORTS)}",
        )
    if delimiter not in (",", ";", "\t"):
        raise HTTPException(status_code=422, detail="delimiter must be one of , ; \\t")

    _guard(request, dataset_id)
    try:
        body = export_service.EXPORTS[kind](
            dataset_id, delimiter=delimiter, location=location
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")

    name = export_service.filename(dataset_id, kind.replace("-", "_"))
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/alerts/slack")
def send_alert(body: AlertRequest):
    recommendations = svc.get_recommendations(body.dataset_id, limit=body.limit, risk="high")
    if body.series_ids:
        recommendations = [r for r in recommendations if r["series_id"] in body.series_ids]
    if not recommendations:
        raise HTTPException(status_code=404, detail="nothing at high risk to send")
    return slack.send_stockout_alert(recommendations)
