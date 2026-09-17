"""Foundation models served over HTTP by the GPU box.

Both TimesFM and TiRex-2 are deployed behind one endpoint, so one adapter class
covers both — the model name is just a field in the request body.

Two consequences of that contract, both handled here:

- The service takes ONE series per call, so forecast_batch fans out across a
  thread pool instead of sending a batch. Ordering is preserved.
- The service takes NO covariates, so these adapters cannot see the Indonesian
  calendar. The router therefore also registers `<model>+calendar` variants that
  wrap these in CalendarAdjustedModel, which applies the Lebaran uplift on top
  of whatever the GPU returns.

Availability is probed once at startup. A dead endpoint, wrong key or timeout
means the router silently drops the model and the pipeline finishes on
baselines — never a failed run.
"""

from __future__ import annotations

import logging
import os
import time

import numpy as np

from . import gpu_client
from .base import Forecast, ForecastModel, empirical_interval

log = logging.getLogger(__name__)


def _recheck_after() -> float:
    """Seconds before a failed probe is retried rather than trusted."""
    return float(os.getenv("GPU_RECHECK_SECONDS", "60"))


def _offline_allowed() -> bool:
    return os.getenv("GPU_OFFLINE", "").lower() in ("1", "true", "yes")


class RemoteFoundationModel(ForecastModel):
    """One class, two deployments. `model_id` is what the service expects."""

    needs_gpu = True
    _instances: dict[str, "RemoteFoundationModel"] = {}

    def __init__(self, model_id: str, licence: str) -> None:
        self.model_id = model_id
        self.name = model_id
        self.licence = licence
        self._available: bool | None = None
        self._error: str = ""
        self._checked_at: float = 0.0

    @classmethod
    def get(cls, model_id: str, licence: str = "") -> "RemoteFoundationModel":
        if model_id not in cls._instances:
            cls._instances[model_id] = cls(model_id, licence)
        return cls._instances[model_id]

    @property
    def available(self) -> bool:
        # A failed probe expires. Caching it forever means one tunnel hiccup at
        # startup removes the foundation models for the life of the process,
        # even after the service comes back — which is exactly how a working GPU
        # box ends up absent from the model mix on stage.
        if self._available is False and self._checked_at:
            if time.time() - self._checked_at > _recheck_after():
                self._available = None

        if self._available is None:
            self._checked_at = time.time()
            self._available, self._error = gpu_client.probe(self.model_id)
            if self._available:
                log.info("%s reachable on GPU service (%s)", self.model_id, self.licence)
            else:
                # Demo insurance. The GPU box is behind an ephemeral tunnel; if it
                # dies between rehearsal and presentation, GPU_OFFLINE=1 keeps the
                # model in the router and serves the cached responses from the last
                # successful run. Uncached series fall back to a flat carry-forward,
                # so only turn this on when the cache was built on this dataset.
                cache = gpu_client.cache_stats()
                if _offline_allowed() and cache["entries"] > 0:
                    self._available = True
                    self._error = (
                        f"offline: serving {cache['entries']} cached responses "
                        f"({self._error})"
                    )
                    log.warning("%s OFFLINE from cache: %s", self.model_id, self._error)
                else:
                    log.warning("%s unavailable: %s", self.model_id, self._error)
        return bool(self._available)

    def recheck(self) -> bool:
        """Force a fresh probe — the tunnel URL changes when it is restarted."""
        self._available = None
        self._error = ""
        return self.available

    @property
    def error(self) -> str:
        return self._error

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        history = np.asarray(history, dtype=float)
        payload = gpu_client.forecast_one(self.model_id, history, horizon)
        return self._to_forecast(history, payload, horizon)

    def forecast_batch(
        self,
        histories,
        horizon,
        seasonal_period=7,
        covariates=None,
        future_covariates=None,
    ) -> list[Forecast]:
        arrays = [np.asarray(h, dtype=float) for h in histories]
        payloads = gpu_client.forecast_many(self.model_id, arrays, horizon)

        results: list[Forecast] = []
        for history, payload in zip(arrays, payloads):
            if payload is None:
                # One series failed upstream. Return a flat carry-forward rather
                # than raising, so a single bad call cannot void the batch.
                level = float(history[-14:].mean()) if history.size else 0.0
                point = np.full(horizon, max(0.0, level))
                lower, upper = empirical_interval(history, point)
                results.append(
                    Forecast(point=point, lower=lower, upper=upper, model_name=self.name)
                )
                continue
            results.append(self._to_forecast(history, payload, horizon))
        return results

    def _to_forecast(self, history: np.ndarray, payload, horizon: int) -> Forecast:
        point = gpu_client.extract_point(payload, horizon)
        if point is None:
            raise ValueError(
                f"{self.model_id}: could not read a forecast from the response"
            )

        lower, upper = gpu_client.extract_bounds(payload, horizon)
        if lower is None or upper is None:
            lower, upper = empirical_interval(history, point)

        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)


def timesfm() -> RemoteFoundationModel:
    return RemoteFoundationModel.get("timesfm", "non-commercial weights")


def tirex() -> RemoteFoundationModel:
    return RemoteFoundationModel.get("tirex", "Apache-2.0")
