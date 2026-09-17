"""Verify the GPU inference service and warm the demo cache.

Run this every time the tunnel URL changes — localhost.run hands out a new
hostname on each reconnect, and a stale GPU_INFERENCE_URL looks exactly like a
broken model from inside the pipeline.

    py -3.11 scripts/check_gpu.py              # probe both models
    py -3.11 scripts/check_gpu.py --warm       # also pre-forecast the demo data

The --warm pass matters before presenting: it fills the on-disk cache so the
demo keeps working even if the tunnel dies mid-pitch (set GPU_OFFLINE=1 then).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config  # noqa: E402,F401 — loads .env
from app.db import database as db  # noqa: E402
from app.forecasting import gpu_client  # noqa: E402

MODELS = ("tirex", "timesfm")
WARM_HORIZON = 30


def show_config() -> bool:
    url = os.getenv("GPU_INFERENCE_URL", "")
    key = os.getenv("GPU_INFERENCE_API_KEY", "")
    print(f"URL      {url or '(not set)'}")
    print(f"API key  {'set, ' + str(len(key)) + ' chars' if key else '(not set)'}")
    if not url or not key:
        print("\nSet GPU_INFERENCE_URL and GPU_INFERENCE_API_KEY in backend/.env")
        return False
    return True


def probe_models() -> list[str]:
    alive: list[str] = []
    print("\nProbing models")
    for model in MODELS:
        started = time.time()
        ok, error = gpu_client.probe(model)
        took = time.time() - started
        if ok:
            alive.append(model)
            print(f"  {model:10} OK        {took:5.1f}s")
        else:
            print(f"  {model:10} FAILED    {took:5.1f}s  {error}")
    return alive


def show_shape(model: str) -> None:
    """Print one raw response. The parser guesses at the shape — confirm it."""
    print(f"\nRaw response shape from {model}")
    values = [float(20 + (i % 7) * 3) for i in range(120)]
    try:
        # Bypass the cache so this reflects the live service.
        previous = os.environ.get("GPU_CACHE")
        os.environ["GPU_CACHE"] = "0"
        payload = gpu_client.forecast_one(model, values, 8)
        if previous is None:
            os.environ.pop("GPU_CACHE", None)
        else:
            os.environ["GPU_CACHE"] = previous
    except Exception as exc:  # noqa: BLE001
        print(f"  failed: {exc}")
        return

    if isinstance(payload, dict):
        print(f"  keys: {list(payload)}")
        for key, value in payload.items():
            if isinstance(value, list):
                print(f"    {key}: list[{len(value)}] {value[:4]}")
            elif isinstance(value, dict):
                print(f"    {key}: dict{list(value)[:6]}")
            else:
                print(f"    {key}: {value!r}")
    else:
        print(f"  {type(payload).__name__}: {json.dumps(payload)[:200]}")

    point = gpu_client.extract_point(payload, 8)
    lower, upper = gpu_client.extract_bounds(payload, 8)
    print(f"  parsed point : {None if point is None else [round(v, 2) for v in point[:5]]}")
    print(f"  parsed bounds: {'yes' if lower is not None else 'no (falls back to empirical)'}")
    if point is None:
        print("  >>> PARSER DID NOT UNDERSTAND THIS. Add the key to POINT_KEYS in gpu_client.py")


def warm(models: list[str]) -> None:
    """Pre-forecast every forecastable series in the newest dataset."""
    from app.services import pipeline_service as svc

    row = db.query_one("SELECT dataset_id FROM datasets ORDER BY created_at DESC LIMIT 1")
    if not row:
        print("\nNo dataset to warm. Run smoke_test.py first.")
        return

    dataset_id = row["dataset_id"]
    canonical, frequency, _ = svc._load_canonical(dataset_id)
    ids = [
        r["series_id"]
        for r in db.query(
            "SELECT series_id FROM series_profiles WHERE dataset_id = ? AND forecastable = 1",
            (dataset_id,),
        )
    ]
    histories = svc._series_matrix(canonical, ids)
    series = [histories[s] for s in ids if s in histories]

    print(f"\nWarming cache on {dataset_id}: {len(series)} series x {len(models)} models")
    for model in models:
        started = time.time()
        results = gpu_client.forecast_many(model, series, WARM_HORIZON)
        ok = sum(1 for r in results if r is not None)
        took = time.time() - started
        rate = len(series) / took if took else 0
        print(f"  {model:10} {ok}/{len(series)} ok in {took:5.1f}s ({rate:.1f} series/s)")


def main() -> None:
    db.init()
    if not show_config():
        sys.exit(1)

    alive = probe_models()
    if not alive:
        print("\nNothing reachable. Restart the tunnel and update GPU_INFERENCE_URL.")
        print("The pipeline still runs without it — baselines plus the calendar wrapper.")
        sys.exit(1)

    for model in alive:
        show_shape(model)

    if "--warm" in sys.argv:
        warm(alive)

    stats = gpu_client.cache_stats()
    print(f"\nCache: {stats['entries']} entries, {stats['bytes'] / 1024:.0f} KB")
    print("Before presenting: run with --warm, then set GPU_OFFLINE=1 as insurance.")


if __name__ == "__main__":
    main()
