"""REST API. FROZEN contract — see architecture.md.

Endpoints are thin. Every one of them delegates to the service layer, which is
also what the MCP server calls, so the two interfaces can never drift.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..canonical import DecisionMode
from ..db import database as db
from ..integrations import slack
from ..services import pipeline_service as svc

router = APIRouter(prefix="/api/v1")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class IngestRecords(BaseModel):
    source: str = "api"
    records: list[dict]


class MappingOverrides(BaseModel):
    overrides: dict[str, str] = {}


class ForecastRequest(BaseModel):
    horizon: int = 30
    use_calendar: bool = True
    mode: DecisionMode = DecisionMode.RITEL


class AlertRequest(BaseModel):
    dataset_id: str
    series_ids: list[str] = []
    limit: int = 5


# ---------------------------------------------------------------- ingestion

@router.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    try:
        payload = await file.read()
        return svc.ingest(file.filename or "upload.csv", payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/ingest/json")
def ingest_json(body: IngestRecords):
    if not body.records:
        raise HTTPException(status_code=400, detail="records cannot be empty")
    try:
        return svc.ingest_records(body.source, body.records)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------- mapping

@router.get("/datasets/{dataset_id}/mapping")
def get_mapping(dataset_id: str):
    try:
        return svc.get_mapping(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.post("/datasets/{dataset_id}/mapping")
def confirm_mapping(dataset_id: str, body: MappingOverrides):
    try:
        result = svc.confirm_mapping(dataset_id, body.overrides)
        result["health"] = svc.prepare(dataset_id)
        return result
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/health")
def get_health(dataset_id: str):
    try:
        return svc.get_health(dataset_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="dataset not found")


@router.get("/datasets")
def list_datasets():
    rows = db.query(
        """SELECT dataset_id, filename, created_at, preset_matched, health_score,
                  mapping_confirmed, frequency, decision_mode
           FROM datasets ORDER BY created_at DESC LIMIT 50"""
    )
    return [dict(r) for r in rows]


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
    row = db.query_one("SELECT * FROM jobs WHERE job_id = ?", (job_id,))
    if not row:
        raise HTTPException(status_code=404, detail="job not found")
    return dict(row)


@router.get("/forecasts/{dataset_id}")
def list_forecasts(dataset_id: str, limit: int = 100):
    rows = db.query(
        """SELECT s.series_id, s.item_id, s.location_id, s.demand_class, s.adi, s.cv2,
                  m.model_name, m.wape, m.mase, m.bias, m.reason
           FROM series_profiles s
           LEFT JOIN model_selection m
             ON m.dataset_id = s.dataset_id AND m.series_id = s.series_id
           WHERE s.dataset_id = ? AND s.forecastable = 1
           LIMIT ?""",
        (dataset_id, limit),
    )
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


# ---------------------------------------------------------------- decisions

@router.get("/recommendations/{dataset_id}")
def get_recommendations(dataset_id: str, limit: int = 50, risk: str | None = None):
    return {
        "dataset_id": dataset_id,
        "recommendations": svc.get_recommendations(dataset_id, limit, risk),
    }


@router.get("/value/{dataset_id}")
def get_value(dataset_id: str):
    result = svc.get_value_simulation(dataset_id)
    if not result:
        raise HTTPException(status_code=404, detail="no simulation yet — run a forecast first")
    return result


@router.get("/usage/{dataset_id}")
def get_usage(dataset_id: str):
    """Metering. LAMPU bills on consumption, so we count what we would bill."""
    return svc.get_usage(dataset_id)


@router.post("/alerts/slack")
def send_alert(body: AlertRequest):
    recommendations = svc.get_recommendations(body.dataset_id, limit=body.limit, risk="high")
    if body.series_ids:
        recommendations = [r for r in recommendations if r["series_id"] in body.series_ids]
    if not recommendations:
        raise HTTPException(status_code=404, detail="nothing at high risk to send")
    return slack.send_stockout_alert(recommendations)
