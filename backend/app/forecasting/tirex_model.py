"""TiRex-2 adapter (NX-AI).

Strategically this is the more important of the two foundation models, for one
reason that has nothing to do with accuracy: **TiRex-2 is Apache 2.0**, so it can
be deployed commercially. TimesFM-3's pretrained weights are restricted to
non-commercial, non-production use, which means a product built on them has no
legal path to production without swapping the model out.

It also takes past and future-known covariates, so the Indonesian calendar feeds
it directly — the same known-future path TimesFM-3 offers, but on a checkpoint we
could actually ship.

So the honest positioning is: TiRex-2 is the production engine, TimesFM-3 is a
benchmark we run alongside it. Both sit behind the same interface, and the
backtest picks per series. That is the model-agnostic claim demonstrated rather
than asserted.

Install (on the GPU box, not the laptop — it pulls torch):

    pip install tirex-2

Docs: https://github.com/NX-AI/tirex-2

As with TimesFM, an unavailable package makes this adapter report itself
unavailable and the router simply drops it. The pipeline still runs on baselines.
"""

from __future__ import annotations

import logging
import os

import numpy as np

from .base import Forecast, ForecastModel, empirical_interval

log = logging.getLogger(__name__)

CHECKPOINT = os.getenv("TIREX_CHECKPOINT", "NX-AI/TiRex-2")
DEVICE = os.getenv("TIREX_DEVICE", "cuda")
BATCH_SIZE = int(os.getenv("TIREX_BATCH_SIZE", "32"))
MAX_CONTEXT = int(os.getenv("TIREX_MAX_CONTEXT", "2048"))

# Output is (n_targets, 9 quantiles, prediction_length): 0.1 .. 0.9
Q_LOWER, Q_MEDIAN, Q_UPPER = 0, 4, 8


class TiRexModel(ForecastModel):
    name = "tirex"
    needs_gpu = True

    _instance: "TiRexModel | None" = None

    def __init__(self) -> None:
        self._model = None
        self._ts_type = None
        self._available: bool | None = None
        self._error: str = ""

    @classmethod
    def instance(cls) -> "TiRexModel":
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
        """Load the checkpoint once at startup. Failure is survivable."""
        if os.getenv("DISABLE_TIREX", "").lower() in ("1", "true", "yes"):
            self._available, self._error = False, "disabled by DISABLE_TIREX"
            return
        try:
            from tirex2 import TimeseriesType, load_model  # type: ignore

            self._model = load_model(CHECKPOINT, device=DEVICE)
            self._ts_type = TimeseriesType
            self._available = True
            log.info("TiRex-2 loaded: %s on %s", CHECKPOINT, DEVICE)
        except Exception as exc:  # noqa: BLE001 — any failure means fall back
            self._available = False
            self._error = f"{type(exc).__name__}: {exc}"
            log.warning("TiRex-2 unavailable, router will skip it: %s", self._error)

    @staticmethod
    def _stack(covariates: dict[str, np.ndarray] | None, length: int | None = None):
        """Dict of named series -> (n_features, length) array, or None."""
        if not covariates:
            return None
        rows = []
        for key in sorted(covariates):
            values = np.asarray(covariates[key], dtype=float)
            if length is not None:
                if values.size < length:
                    continue
                values = values[-length:] if values.size > length else values
            rows.append(values)
        if not rows:
            return None
        width = min(len(r) for r in rows)
        return np.stack([r[-width:] for r in rows])

    def _build(self, history: np.ndarray, covariates, future_covariates):
        context = np.asarray(history, dtype=float)[-MAX_CONTEXT:]
        past = self._stack(covariates, length=context.size)
        future = self._stack(future_covariates)
        return self._ts_type(
            target=context.reshape(1, -1),
            past_covariates=past,
            future_covariates=future,
        )

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
            raise RuntimeError(f"TiRex-2 unavailable: {self._error}")

        results: list[Forecast] = []
        for start in range(0, len(histories), BATCH_SIZE):
            chunk = histories[start : start + BATCH_SIZE]
            series = [
                self._build(
                    history,
                    covariates[start + i] if covariates else None,
                    future_covariates[start + i] if future_covariates else None,
                )
                for i, history in enumerate(chunk)
            ]

            outputs = self._model.forecast(
                series, prediction_length=horizon, output_type="numpy"
            )

            for history, output in zip(chunk, outputs):
                results.append(
                    self._to_forecast(np.asarray(history, dtype=float), output, horizon)
                )
        return results

    def _to_forecast(self, history: np.ndarray, output, horizon: int) -> Forecast:
        """Normalize (n_targets, 9 quantiles, horizon) into our Forecast."""
        array = np.asarray(output, dtype=float)
        array = np.squeeze(array)

        if array.ndim == 2 and array.shape[0] >= Q_UPPER + 1:
            # (quantiles, horizon)
            point = array[Q_MEDIAN]
            lower, upper = array[Q_LOWER], array[Q_UPPER]
        elif array.ndim == 2:
            # (horizon, quantiles)
            point = array[:, array.shape[1] // 2]
            lower, upper = array[:, 0], array[:, -1]
        else:
            point = array
            lower = upper = None

        point = np.asarray(point, dtype=float).ravel()[:horizon]
        if point.size < horizon:
            point = np.pad(point, (0, horizon - point.size), mode="edge")

        if lower is None or upper is None:
            lower, upper = empirical_interval(history, point)
        else:
            lower = np.asarray(lower, dtype=float).ravel()[:horizon]
            upper = np.asarray(upper, dtype=float).ravel()[:horizon]

        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)
