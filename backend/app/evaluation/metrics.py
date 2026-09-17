"""Forecast accuracy metrics.

WAPE for smooth and erratic demand. MASE for intermittent and lumpy, because
WAPE denominators approach zero on sparse demand and the ranking becomes noise.
Bias always, because a model can post respectable accuracy while running
systematically high — and that costs more than the error rate does.
"""

from __future__ import annotations

import numpy as np

from ..canonical import DemandClass


def wape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Weighted absolute percentage error. Scale-free within a series."""
    actual = np.asarray(actual, float)
    predicted = np.asarray(predicted, float)
    denominator = np.abs(actual).sum()
    if denominator == 0:
        return float("inf") if np.abs(predicted).sum() > 0 else 0.0
    return float(np.abs(actual - predicted).sum() / denominator)


def mase(actual: np.ndarray, predicted: np.ndarray, history: np.ndarray, period: int = 1) -> float:
    """Mean absolute scaled error, scaled by the in-sample seasonal naive error."""
    actual = np.asarray(actual, float)
    predicted = np.asarray(predicted, float)
    history = np.asarray(history, float)

    if history.size <= period:
        return float("inf")

    naive_errors = np.abs(history[period:] - history[:-period])
    scale = float(naive_errors.mean()) if naive_errors.size else 0.0
    if scale == 0:
        return float("inf") if np.abs(actual - predicted).sum() > 0 else 0.0

    return float(np.abs(actual - predicted).mean() / scale)


def rmse(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Root mean squared error, in units.

    This is what safety stock must be sized on. Sizing the buffer on the spread
    of the forecast itself punishes any model that captures seasonality, which
    is exactly backwards: a better forecast should need a SMALLER buffer.
    """
    actual = np.asarray(actual, float)
    predicted = np.asarray(predicted, float)
    if actual.size == 0:
        return 0.0
    return float(np.sqrt(np.mean((actual - predicted) ** 2)))


def bias(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Signed. Positive means we over-forecast, which inflates inventory."""
    actual = np.asarray(actual, float)
    predicted = np.asarray(predicted, float)
    denominator = np.abs(actual).sum()
    if denominator == 0:
        return 0.0
    return float((predicted - actual).sum() / denominator)


def primary_metric(demand_class: DemandClass) -> str:
    if demand_class in (DemandClass.INTERMITTENT, DemandClass.LUMPY):
        return "mase"
    return "wape"


def score(
    actual: np.ndarray,
    predicted: np.ndarray,
    history: np.ndarray,
    demand_class: DemandClass,
    period: int = 1,
) -> dict[str, float]:
    return {
        "wape": round(wape(actual, predicted), 4),
        "mase": round(mase(actual, predicted, history, period), 4),
        "bias": round(bias(actual, predicted), 4),
        # Carried through so the decision engine can size safety stock on the
        # error this model actually makes, rather than on the forecast's spread.
        "rmse": round(rmse(actual, predicted), 4),
        "primary": primary_metric(demand_class),
    }
