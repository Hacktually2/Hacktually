"""Simulate an ERP driving the platform over REST, with no dashboard involved.

This is the answer to "what if we run it straight from our own system?" — shown
rather than promised. A real connector needs vendor API credentials and a
sandbox account, which is a partnership conversation, not an evening's work.
What can be proved tonight is that the whole product is reachable over HTTP:

    ERP pushes rows      -> POST /api/v1/ingest/json
    confirms the mapping -> POST /api/v1/datasets/{id}/mapping
    triggers a run       -> POST /api/v1/datasets/{id}/forecast
    polls the job        -> GET  /api/v1/jobs/{id}
    pulls decisions back -> GET  /api/v1/recommendations/{id}

Deliberately posts field names no ERP shares with us (`tanggal_transaksi`,
`kode_item`, `jumlah_keluar`) so the schema adapter has to earn its keep on the
API path too, not just on file upload.

    py -3.11 scripts/erp_roundtrip.py                 # against a running server
    py -3.11 scripts/erp_roundtrip.py --in-process    # no server needed
"""

from __future__ import annotations

import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402

BASE = "http://127.0.0.1:8000"
SOURCE = Path(__file__).resolve().parents[2] / "data" / "demo" / "distributor_generic.csv"
MAX_ROWS = 40_000
HORIZON = 30


def build_payload() -> dict:
    """Rows shaped the way someone else's system would send them."""
    if not SOURCE.exists():
        print(f"Missing {SOURCE}. Run make_demo_data.py first.")
        raise SystemExit(1)

    records = []
    with SOURCE.open(encoding="utf-8") as handle:
        for i, row in enumerate(csv.DictReader(handle)):
            if i >= MAX_ROWS:
                break
            records.append(
                {
                    "tanggal_transaksi": row["invoice_date"],
                    "kode_item": row["product_code"],
                    "gudang": row["branch_id"],
                    "jumlah_keluar": int(row["units_sold"]),
                    "sisa_stok": int(row["stock_on_hand"]),
                    "harga": float(row["unit_price"]),
                }
            )
    return {"source": "erp_simulator", "records": records}


def step(n: int, label: str) -> None:
    print(f"\n[{n}] {label}")


def run_http() -> None:
    payload = build_payload()
    with httpx.Client(base_url=BASE, timeout=600) as client:
        try:
            client.get("/health").raise_for_status()
        except Exception as exc:  # noqa: BLE001
            print(f"No server at {BASE} ({type(exc).__name__}).")
            print("Start it:  uvicorn app.main:app --port 8000")
            print("Or run:    py -3.11 scripts/erp_roundtrip.py --in-process")
            raise SystemExit(1)

        step(1, f"ERP pushes {len(payload['records']):,} rows to /ingest/json")
        started = time.time()
        result = client.post("/api/v1/ingest/json", json=payload).json()
        dataset_id = result["dataset_id"]
        detected = {
            f["canonical"]: f["source_column"]
            for f in result["mapping"]["fields"]
            if f["source_column"]
        }
        print(f"    dataset {dataset_id} in {time.time() - started:.1f}s")
        print("    fields the adapter recovered from unfamiliar names:")
        for canonical, column in detected.items():
            print(f"      {canonical:<14} <- {column}")

        step(2, "ERP confirms the mapping")
        client.post(f"/api/v1/datasets/{dataset_id}/mapping", json={"overrides": {}}).raise_for_status()
        health = client.get(f"/api/v1/datasets/{dataset_id}/health").json()
        print(f"    health {health['health_score']}/100 · "
              f"{health['series_forecastable']}/{health['series_total']} series forecastable")

        step(3, "ERP sets its own commercial terms")
        client.put(
            f"/api/v1/datasets/{dataset_id}/params",
            json={
                "entries": [
                    {"scope": "default", "scope_value": "",
                     "values": {"lead_time_days": 14, "moq": 250, "service_level": 0.95,
                                "unit_cost": 50000, "unit_margin": 12000}}
                ]
            },
        ).raise_for_status()
        print("    lead time 14d · MOQ 250 · service level 95%")

        step(4, "ERP triggers a forecast and polls")
        job_id = client.post(
            f"/api/v1/datasets/{dataset_id}/forecast",
            json={"horizon": HORIZON, "mode": "ritel"},
        ).json()["job_id"]
        started = time.time()
        while True:
            job = client.get(f"/api/v1/jobs/{job_id}").json()
            if job["status"] in ("completed", "failed"):
                break
            print(f"    {job['progress']:>3}%  {job['stage']}", end="\r")
            time.sleep(2)
        print(f"    {job['status']} in {time.time() - started:.1f}s          ")
        if job["status"] == "failed":
            print(f"    error: {job['error']}")
            raise SystemExit(1)

        step(5, "ERP pulls decisions back")
        recs = client.get(f"/api/v1/recommendations/{dataset_id}?limit=5").json()["recommendations"]
        print(f"    {'item':<14}{'gudang':<10}{'risk':<8}{'order':>10}")
        for r in recs:
            print(f"    {r['item_id'] or '-':<14}{r['location_id'] or '-':<10}"
                  f"{r['stockout_risk']:<8}{r['recommended_qty']:>10,.0f}")

        hierarchy = client.get(f"/api/v1/datasets/{dataset_id}/hierarchy").json()
        print(f"\n    network total: {hierarchy['network']['horizon_total']:,.0f} units / {HORIZON}d")
        for b in hierarchy["branches"]:
            print(f"      {b['location_id']:<8}{b['horizon_total']:>12,.0f}")

        usage = client.get(f"/api/v1/usage/{dataset_id}").json()
        print(f"\n    metered: {usage['forecast_points']:,} forecast points billed")

    print("\nNo dashboard was opened. Every step was an HTTP call.")


def run_in_process() -> None:
    """Same sequence without a server, for when uvicorn is not running."""
    from fastapi.testclient import TestClient
    from app.main import app

    payload = build_payload()
    with TestClient(app) as client:
        step(1, f"ERP pushes {len(payload['records']):,} rows to /ingest/json")
        result = client.post("/api/v1/ingest/json", json=payload).json()
        dataset_id = result["dataset_id"]
        detected = {
            f["canonical"]: f["source_column"]
            for f in result["mapping"]["fields"]
            if f["source_column"]
        }
        for canonical, column in detected.items():
            print(f"      {canonical:<14} <- {column}")

        step(2, "confirm mapping")
        client.post(f"/api/v1/datasets/{dataset_id}/mapping", json={"overrides": {}})
        health = client.get(f"/api/v1/datasets/{dataset_id}/health").json()
        print(f"    health {health['health_score']}/100 · {health['series_forecastable']} series")

        step(3, "set commercial terms")
        client.put(
            f"/api/v1/datasets/{dataset_id}/params",
            json={"entries": [{"scope": "default", "scope_value": "",
                               "values": {"lead_time_days": 14, "moq": 250,
                                          "service_level": 0.95, "unit_cost": 50000,
                                          "unit_margin": 12000}}]},
        )

        step(4, "forecast (BackgroundTasks run inline under TestClient)")
        job_id = client.post(
            f"/api/v1/datasets/{dataset_id}/forecast",
            json={"horizon": HORIZON, "mode": "ritel"},
        ).json()["job_id"]
        job = client.get(f"/api/v1/jobs/{job_id}").json()
        print(f"    {job['status']}")

        step(5, "pull decisions back")
        recs = client.get(f"/api/v1/recommendations/{dataset_id}?limit=5").json()["recommendations"]
        for r in recs:
            print(f"    {r['item_id'] or '-':<14}{r['location_id'] or '-':<10}"
                  f"{r['stockout_risk']:<8}{r['recommended_qty']:>10,.0f}")

    print("\nNo dashboard was opened. Every step was an HTTP call.")


if __name__ == "__main__":
    if "--in-process" in sys.argv:
        run_in_process()
    else:
        run_http()
