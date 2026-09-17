"""Statistical baselines. No training — parameters are fitted per series at call time.

Seasonal naive is the honesty check: if the foundation model cannot beat this,
say so rather than hiding it.
"""

from __future__ import annotations

import numpy as np

from .base import Forecast, ForecastModel, empirical_interval

ALPHA_GRID = (0.05, 0.1, 0.2, 0.3, 0.4)


class SeasonalNaiveModel(ForecastModel):
    """Repeat the last full season. The baseline everything must beat."""

    name = "seasonal_naive"

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        history = np.asarray(history, dtype=float)
        if history.size == 0:
            point = np.zeros(horizon)
        elif history.size < seasonal_period:
            point = np.full(horizon, float(history[-1]))
        else:
            season = history[-seasonal_period:]
            point = np.array([season[i % seasonal_period] for i in range(horizon)])

        lower, upper = empirical_interval(history, point)
        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)


class MovingAverageModel(ForecastModel):
    """What the customer is most likely doing today in Excel.

    This is the honest baseline for the value simulation — not a strawman.
    """

    name = "moving_average"

    def __init__(self, window: int = 28) -> None:
        self.window = window

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        history = np.asarray(history, dtype=float)
        if history.size == 0:
            point = np.zeros(horizon)
        else:
            window = min(self.window, history.size)
            point = np.full(horizon, float(history[-window:].mean()))

        lower, upper = empirical_interval(history, point)
        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)


def _croston_core(history: np.ndarray, alpha: float, tsb: bool) -> float:
    """Shared engine. Croston smooths the demand interval; TSB smooths probability."""
    nonzero_idx = np.flatnonzero(history > 0)
    if nonzero_idx.size == 0:
        return 0.0

    size = float(history[nonzero_idx[0]])
    if tsb:
        prob = 1.0 / max(1.0, float(nonzero_idx[0] + 1))
        for value in history[nonzero_idx[0] + 1 :]:
            if value > 0:
                size += alpha * (value - size)
                prob += alpha * (1.0 - prob)
            else:
                prob += alpha * (0.0 - prob)
        return size * prob

    interval = float(nonzero_idx[0] + 1)
    gap = 0
    for value in history[nonzero_idx[0] + 1 :]:
        gap += 1
        if value > 0:
            size += alpha * (value - size)
            interval += alpha * (gap - interval)
            gap = 0
    return size / interval if interval > 0 else 0.0


def _fit_alpha(history: np.ndarray, tsb: bool) -> float:
    """Grid search on in-sample one-step error. Fitting, not training."""
    if history.size < 8:
        return 0.1

    split = max(4, int(history.size * 0.7))
    train, holdout = history[:split], history[split:]
    if holdout.size == 0:
        return 0.1

    best_alpha, best_error = 0.1, float("inf")
    for alpha in ALPHA_GRID:
        rate = _croston_core(train, alpha, tsb)
        error = float(np.mean(np.abs(holdout - rate)))
        if error < best_error:
            best_alpha, best_error = alpha, error
    return best_alpha


class CrostonModel(ForecastModel):
    """For intermittent demand. Forecasts a flat rate, which is the point."""

    name = "croston"
    tsb = False

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        history = np.asarray(history, dtype=float)
        alpha = _fit_alpha(history, self.tsb)
        rate = _croston_core(history, alpha, self.tsb)
        point = np.full(horizon, max(0.0, rate))
        lower, upper = empirical_interval(history, point)
        return Forecast(point=point, lower=lower, upper=upper, model_name=self.name)


class TSBModel(CrostonModel):
    """Teunter-Syntetos-Babai. Handles items whose demand is dying out."""

    name = "tsb"
    tsb = True
