"""TimesFM adapter.

Loaded once at startup as a singleton and always called through predict_batch.
Never per-series in a loop — that is what stalls a demo on stage.

If the package or checkpoint is unavailable the adapter reports itself
unavailable and the router simply drops it from the candidate set. The pipeline
still runs end to end on baselines, which is the whole point of the interface.
"""

from __future__ import annotations

import logging
import os

import numpy as np

from .base import Forecast, ForecastModel, empirical_interval

log = logging.getLogger(__name__)

CHECKPOINT = os.getenv("TIMESFM_CHECKPOINT", "google/timesfm-3.0-pytorch")
BATCH_SIZE = int(os.getenv("TIMESFM_BATCH_SIZE", "16"))
DEVICE = os.getenv("TIMESFM_DEVICE", "cuda")
MAX_CONTEXT = 2048

# Quantile indices returned by the model: 0.1 .. 0.9
Q_LOWER, Q_UPPER = 0, 8


class TimesFMModel(ForecastModel):
    name = "timesfm"
    needs_gpu = True

    _instance: "TimesFMModel | None" = None

    def __init__(self) -> None:
        self._forecaster = None
        self._available: bool | None = None
        self._error: str = ""

    @classmethod
    def instance(cls) -> "TimesFMModel":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def available(self) -> bool:
        if self._available is None:
            self._load()
        return bool(self._available)

    @property
    def error(self) -> str:
        return self._error

    def _load(self) -> None:
        """Load the checkpoint once. Failure is survivable, not fatal."""
        if os.getenv("DISABLE_TIMESFM", "").lower() in ("1", "true", "yes"):
            self._available, self._error = False, "disabled by DISABLE_TIMESFM"
            return
        try:
            from timesfm3 import ModelConfig, TimesFM3Evaluator  # type: ignore

            config = ModelConfig(
                checkpoint_path=CHECKPOINT,
                per_core_batch_size=BATCH_SIZE,
                device=DEVICE,
            )
            self._forecaster = TimesFM3Evaluator(config)
            self._available = True
            log.info("TimesFM loaded: %s on %s", CHECKPOINT, DEVICE)
        except Exception as exc:  # noqa: BLE001 — any failure means fall back
            self._available = False
            self._error = f"{type(exc).__name__}: {exc}"
            log.warning("TimesFM unavailable, falling back to baselines: %s", self._error)

    @staticmethod
    def _stack_covariates(
        covariates: dict[str, np.ndarray] | None,
        future: dict[str, np.ndarray] | None,
    ) -> tuple[list[np.ndarray] | None, list[np.ndarray] | None]:
        """Past-only and past-and-future arrays in the shapes the model expects."""
        past_only = None
        past_future = None

        if covariates:
            shared = set(covariates) & set(future or {})
            past_keys = [k for k in covariates if k not in shared]
            if past_keys:
                past_only = [np.asarray(covariates[k], float) for k in past_keys]
            if shared and future:
                past_future = [
                    np.concatenate(
                        [
                            np.asarray(covariates[k], float),
                            np.asarray(future[k], float),
                        ]
                    )
                    for k in sorted(shared)
                ]
        return past_only, past_future

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        return self.forecast_batch(
            [history],
            horizon,
            seasonal_period,
            [covariates] if covariates else None,
            [future_covariates] if future_covariates else None,
        )[0]

    def forecast_batch(
        self,
        histories,
        horizon,
        seasonal_period=7,
        covariates=None,
        future_covariates=None,
    ) -> list[Forecast]:
        if not self.available:
            raise RuntimeError(f"TimesFM unavailable: {self._error}")

        results: list[Forecast] = []
        for start in range(0, len(histories), BATCH_SIZE):
            chunk = histories[start : start + BATCH_SIZE]
            contexts = [
                np.asarray(h, dtype=float)[-MAX_CONTEXT:].reshape(1, -1) for h in chunk
            ]

            kwargs: dict = {
                "contexts": contexts,
                "horizon": horizon,
                "return_quantiles": True,
                "use_symmetric_averaging": False,
            }

            if covariates or future_covariates:
                past_batch, future_batch = [], []
                for offset in range(len(chunk)):
                    index = start + offset
                    past_only, past_future = self._stack_covariates(
                        covariates[index] if covariates else None,
                        future_covariates[index] if future_covariates else None,
                    )
                    past_batch.append(past_only)
                    future_batch.append(past_future)
                if any(p is not None for p in past_batch):
                    kwargs["past_only_covariates"] = past_batch
                if any(f is not None for f in future_batch):
                    kwargs["past_future_covariates"] = future_batch

            outputs = list(self._forecaster.predict_batch(**kwargs))

            for history, output in zip(chunk, outputs):
                results.append(self._to_forecast(np.asarray(history, float), output, horizon))
        return results

    def _to_forecast(self, history: np.ndarray, output, horizon: int) -> Forecast:
        """Normalize whatever shape the model returns into our Forecast."""
        point = lower = upper = None
        array = np.asarray(getattr(output, "mean", output), dtype=float)
        array = np.squeeze(array)

        if array.ndim == 2:
            # (horizon, quantiles) — take the median and the outer quantiles.
            point = array[:, array.shape[1] // 2]
            lower, upper = array[:, Q_LOWER], array[:, Q_UPPER]
        else:
            point = array

        quantiles = getattr(output, "quantiles", None)
        if quantiles is not None:
            q = np.squeeze(np.asarray(quantiles, dtype=float))
            if q.ndim == 2 and q.shape[1] > Q_UPPER:
                lower, upper = q[:, Q_LOWER], q[:, Q_UPPER]

        point = np.asarray(point, dtype=float).ravel()[:horizon]
        if point.size < horizon:
            point = np.pad(point, (0, horizon - point.size), mode="edge")

        if lower is None or upper is None:
            lower, upper = empirical_interval(history, point)
        else:
            lower = np.asarray(lower, float).ravel()[:horizon]
            upper = np.asarray(upper, float).ravel()[:horizon]

        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)
