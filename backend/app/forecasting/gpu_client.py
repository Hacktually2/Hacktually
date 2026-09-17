"""Client for the remote GPU inference service.

Both foundation models live behind one HTTP endpoint:

    POST {GPU_INFERENCE_URL}/v1/forecast
    X-API-Key: {GPU_INFERENCE_API_KEY}
    {"model": "timesfm" | "tirex", "values": [...], "horizon": 30}

Two properties of that contract drive everything here:

1. **One series per call.** A 117-series dataset backtesting two foundation
   models over two folds is ~470 round trips. Serially at even 300ms each that
   is two and a half minutes of dead air in a demo, so calls are issued through
   a thread pool and the connection is reused.

2. **No covariates parameter.** The calendar cannot be passed to the model, so
   Indonesian seasonality has to be applied by wrapping the remote model in
   CalendarAdjustedModel. That was already the fallback design; now it is the
   only path.

Every failure mode degrades rather than raising into the pipeline: a dead
endpoint, a bad key or a timeout marks the model unavailable and the router
drops it. The pipeline still completes on baselines.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np

from .. import config  # noqa: F401 — loads .env before anything reads it

log = logging.getLogger(__name__)

# Read lazily, never at import time. Module-level constants would freeze whatever
# the environment looked like at the moment of first import, which on a pipeline
# with this many modules is an import-order bug waiting to happen.
def _url() -> str:
    return os.getenv("GPU_INFERENCE_URL", "").rstrip("/")


def _key() -> str:
    return os.getenv("GPU_INFERENCE_API_KEY", "")


def _timeout() -> float:
    return float(os.getenv("GPU_TIMEOUT", "300"))


def _max_workers() -> int:
    return int(os.getenv("GPU_MAX_WORKERS", "8"))


def _max_context() -> int:
    return int(os.getenv("GPU_MAX_CONTEXT", "2048"))


def _probe_timeout() -> float:
    return float(os.getenv("GPU_PROBE_TIMEOUT", "20"))


_client: httpx.Client | None = None
_client_lock = threading.Lock()


def configured() -> bool:
    return bool(_url() and _key())


def _get_client() -> httpx.Client:
    """One pooled client for the process. Reconnecting per call would dominate."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                workers = _max_workers()
                _client = httpx.Client(
                    base_url=_url(),
                    headers={"X-API-Key": _key()},
                    timeout=_timeout(),
                    limits=httpx.Limits(
                        max_connections=workers,
                        max_keepalive_connections=workers,
                    ),
                )
    return _client


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def forecast_one(model: str, values: list[float] | np.ndarray, horizon: int) -> dict:
    """One series, one call, cached on disk.

    The cache is not an optimisation, it is demo insurance. The GPU box is
    reached through a tunnel whose URL is ephemeral; if it dies between the
    rehearsal and the presentation, every foundation-model result dies with it.
    Cached responses keep the exact numbers that were on screen five minutes ago.
    """
    series = np.asarray(values, dtype=float)
    series = np.nan_to_num(series, nan=0.0)[-_max_context():]

    key = _cache_key(model, series, horizon)
    cached = _cache_read(key)
    if cached is not None:
        return cached

    response = _get_client().post(
        "/v1/forecast",
        json={
            "model": model,
            "values": [float(v) for v in series],
            "horizon": int(horizon),
        },
    )
    response.raise_for_status()
    payload = response.json()
    _cache_write(key, payload)
    return payload


# ---------------------------------------------------------------- disk cache

def _cache_dir() -> Path:
    path = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    directory = path / "gpu_cache"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _cache_key(model: str, series: np.ndarray, horizon: int) -> str:
    digest = hashlib.sha1()
    digest.update(model.encode())
    digest.update(str(horizon).encode())
    # Round before hashing so float noise does not defeat the cache.
    digest.update(np.round(series, 4).tobytes())
    return digest.hexdigest()[:20]


def _cache_read(key: str):
    if os.getenv("GPU_CACHE", "1").lower() in ("0", "false", "no"):
        return None
    path = _cache_dir() / f"{key}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — a corrupt cache entry is just a miss
        return None


def _cache_write(key: str, payload) -> None:
    if os.getenv("GPU_CACHE", "1").lower() in ("0", "false", "no"):
        return
    try:
        (_cache_dir() / f"{key}.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )
    except Exception as exc:  # noqa: BLE001 — never fail a forecast over the cache
        log.debug("cache write failed: %s", exc)


def cache_stats() -> dict:
    files = list(_cache_dir().glob("*.json"))
    return {
        "entries": len(files),
        "bytes": sum(f.stat().st_size for f in files),
        "enabled": os.getenv("GPU_CACHE", "1").lower() not in ("0", "false", "no"),
    }


def forecast_many(
    model: str, histories: list[np.ndarray], horizon: int
) -> list[dict | None]:
    """Fan out across the pool, preserving input order.

    A failed series comes back as None rather than killing the batch — one bad
    series must never cost the whole run.
    """
    if not histories:
        return []

    results: list[dict | None] = [None] * len(histories)

    def run(index: int) -> None:
        try:
            results[index] = forecast_one(model, histories[index], horizon)
        except Exception as exc:  # noqa: BLE001
            log.warning("%s forecast failed for series %d: %s", model, index, exc)

    workers = min(_max_workers(), len(histories))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(run, range(len(histories))))

    return results


def probe(model: str) -> tuple[bool, str]:
    """Is this model actually reachable? Called once at startup, never per request."""
    if not configured():
        return False, "GPU_INFERENCE_URL or GPU_INFERENCE_API_KEY not set"

    try:
        client = _get_client()
        response = client.post(
            "/v1/forecast",
            json={"model": model, "values": [float(i % 7) for i in range(64)], "horizon": 4},
            timeout=_probe_timeout(),
        )
        response.raise_for_status()
        payload = response.json()
        if extract_point(payload, 4) is None:
            return False, f"unrecognised response shape: {list(payload)[:6]}"
        return True, ""
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


# The service's response shape is not pinned down, so accept the plausible ones
# rather than guessing one and failing at 3am.
POINT_KEYS = ("forecast", "mean", "point", "prediction", "predictions", "values", "median")
LOWER_KEYS = ("lower", "lower_bound", "q10", "p10")
UPPER_KEYS = ("upper", "upper_bound", "q90", "p90")
QUANTILE_KEYS = ("quantiles", "quantile_forecast", "q")


def _first_array(payload: dict, keys: tuple[str, ...]) -> np.ndarray | None:
    for key in keys:
        if key in payload and payload[key] is not None:
            array = np.asarray(payload[key], dtype=float)
            if array.size:
                return array
    return None


def extract_point(payload, horizon: int) -> np.ndarray | None:
    """Pull the point forecast out of whatever came back."""
    if payload is None:
        return None

    if isinstance(payload, list):
        array = np.asarray(payload, dtype=float)
        return _fit(array, horizon) if array.size else None

    if not isinstance(payload, dict):
        return None

    # Some services nest the useful part.
    for wrapper in ("result", "data", "output", "forecast"):
        inner = payload.get(wrapper)
        if isinstance(inner, dict):
            nested = extract_point(inner, horizon)
            if nested is not None:
                return nested

    array = _first_array(payload, POINT_KEYS)
    if array is None:
        quantiles = _first_array(payload, QUANTILE_KEYS)
        if quantiles is None:
            return None
        array = _median_of(quantiles, horizon)

    if array.ndim == 2:
        array = _median_of(array, horizon)

    return _fit(np.asarray(array, dtype=float).ravel(), horizon)


def extract_bounds(payload, horizon: int) -> tuple[np.ndarray | None, np.ndarray | None]:
    if not isinstance(payload, dict):
        return None, None

    for wrapper in ("result", "data", "output"):
        inner = payload.get(wrapper)
        if isinstance(inner, dict):
            lower, upper = extract_bounds(inner, horizon)
            if lower is not None:
                return lower, upper

    lower = _first_array(payload, LOWER_KEYS)
    upper = _first_array(payload, UPPER_KEYS)
    if lower is not None and upper is not None:
        return _fit(lower.ravel(), horizon), _fit(upper.ravel(), horizon)

    quantiles = _first_array(payload, QUANTILE_KEYS)
    if quantiles is not None and quantiles.ndim == 2:
        if _quantile_axis(quantiles) == 0:
            # (quantiles, horizon) — TiRex returns this layout
            return _fit(quantiles[0], horizon), _fit(quantiles[-1], horizon)
        # (horizon, quantiles) — TimesFM returns this one
        return _fit(quantiles[:, 0], horizon), _fit(quantiles[:, -1], horizon)

    return None, None


def _quantile_axis(block: np.ndarray) -> int:
    """Which axis holds the quantiles: 0 for (quantiles, horizon), 1 for (horizon, quantiles).

    The two models disagree — TiRex returns (9, horizon) and TimesFM returns
    (horizon, 9) — so this cannot be guessed from the shape. It is also not safe
    to guess: when horizon is close to the quantile count the comparison is a
    coin flip, and getting it wrong silently produces nonsense prediction bands
    rather than an error.

    Quantiles are monotonically non-decreasing by definition; a demand forecast
    over time is not. So measure which axis is actually sorted.
    """
    if block.size == 0 or min(block.shape) < 2:
        return 1

    def sorted_fraction(matrix: np.ndarray) -> float:
        diffs = np.diff(matrix, axis=1)
        return float((diffs >= -1e-9).mean()) if diffs.size else 0.0

    along_rows = sorted_fraction(block)        # rows sorted -> rows are quantiles
    along_cols = sorted_fraction(block.T)      # cols sorted -> cols are quantiles

    if abs(along_rows - along_cols) > 0.05:
        return 1 if along_rows > along_cols else 0

    # Near-tie: fall back to the conventional 9-quantile grid.
    if block.shape[0] == 9 and block.shape[1] != 9:
        return 0
    if block.shape[1] == 9 and block.shape[0] != 9:
        return 1
    return 1


def _median_of(array: np.ndarray, horizon: int) -> np.ndarray:
    """Middle quantile from a 2D quantile block, whichever axis it is on."""
    array = np.asarray(array, dtype=float)
    if array.ndim != 2:
        return array.ravel()
    rows, cols = array.shape
    if cols == horizon or rows > cols:
        # (quantiles, horizon) — or more rows than columns, same reading
        return array[rows // 2] if cols == horizon else array[:, cols // 2]
    return array[:, cols // 2]


def _fit(array: np.ndarray, horizon: int) -> np.ndarray:
    array = np.asarray(array, dtype=float).ravel()
    if array.size == 0:
        return array
    if array.size >= horizon:
        return array[:horizon]
    return np.pad(array, (0, horizon - array.size), mode="edge")
