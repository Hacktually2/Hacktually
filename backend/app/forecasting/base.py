"""The forecasting interface. One file to swap TimesFM for anything else.

Every model implements forecast(). The router, backtest and final run only ever
see this interface, which is what makes the model choice cheap to change.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Forecast:
    point: np.ndarray            # shape (horizon,)
    lower: np.ndarray | None = None
    upper: np.ndarray | None = None
    model_name: str = ""

    def __post_init__(self) -> None:
        self.point = np.asarray(self.point, dtype=float)
        self.point = np.clip(np.nan_to_num(self.point, nan=0.0), 0.0, None)
        if self.lower is not None:
            self.lower = np.clip(np.nan_to_num(np.asarray(self.lower, float)), 0.0, None)
        if self.upper is not None:
            self.upper = np.clip(np.nan_to_num(np.asarray(self.upper, float)), 0.0, None)


class ForecastModel:
    """Base class. Stateless — no fitting persists between calls."""

    name: str = "base"
    needs_gpu: bool = False

    def forecast(
        self,
        history: np.ndarray,
        horizon: int,
        seasonal_period: int = 7,
        covariates: dict[str, np.ndarray] | None = None,
        future_covariates: dict[str, np.ndarray] | None = None,
    ) -> Forecast:
        raise NotImplementedError

    def forecast_batch(
        self,
        histories: list[np.ndarray],
        horizon: int,
        seasonal_period: int = 7,
        covariates: list[dict[str, np.ndarray]] | None = None,
        future_covariates: list[dict[str, np.ndarray]] | None = None,
    ) -> list[Forecast]:
        """Default is a loop. Models with real batching override this."""
        out = []
        for i, history in enumerate(histories):
            out.append(
                self.forecast(
                    history,
                    horizon,
                    seasonal_period,
                    covariates[i] if covariates else None,
                    future_covariates[i] if future_covariates else None,
                )
            )
        return out


def empirical_interval(
    history: np.ndarray, point: np.ndarray, z: float = 1.28
) -> tuple[np.ndarray, np.ndarray]:
    """80% interval from the spread of history. Used by models with no native quantiles."""
    if history.size < 2:
        spread = np.abs(point) * 0.3
    else:
        spread = float(np.std(history, ddof=0))
    # Uncertainty grows with horizon.
    growth = np.sqrt(np.arange(1, len(point) + 1))
    band = z * spread * growth
    return np.clip(point - band, 0.0, None), point + band
