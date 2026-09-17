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


def cumulative(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Relative error in TOTAL demand across the window. Decision-aligned.

    The reorder quantity is `lead-time demand + safety stock - stock on hand`.
    Every term is a total over a window; none of them cares which day inside the
    window the demand lands on. So this is the error the decision is actually
    exposed to, and the per-period metrics are not.

    That distinction is invisible on dense demand and decisive on sparse demand.
    A forecast of zero for a series that sells on a sixth of days scores *well*
    on MASE — the per-period absolute error is genuinely small — while getting
    the only number the warehouse needs completely wrong. Selecting on MASE
    therefore prefers a forecast that is accurate and useless.

    This is `abs(bias)`, and that is not a coincidence: bias was always the
    right quantity for this decision. It was reported alongside the metric that
    did the selecting instead of doing the selecting itself.

    The limitation, stated rather than hidden: totals can be right for the wrong
    reasons, so a model that is wildly off per period can win on cancelling
    errors. That is a real cost on smooth demand, which is why this is the
    primary metric only where the timing genuinely does not matter.
    """
    actual = np.asarray(actual, float)
    predicted = np.asarray(predicted, float)
    denominator = np.abs(actual).sum()
    if denominator == 0:
        return float("inf") if np.abs(predicted).sum() > 0 else 0.0
    return float(abs(predicted.sum() - actual.sum()) / denominator)


SPARSE_CLASSES = (DemandClass.INTERMITTENT, DemandClass.LUMPY)

# Sparse classes select on cumulative error, with MASE breaking near-ties.
#
# Measured on the VN2 retail set, 599 real series, one backtest scored both
# ways. Selecting on MASE shipped a near-zero forecast for 43% of intermittent
# and 48% of lumpy series — an "order nothing" recommendation for items that
# sell. Cumulative error removed them entirely (43% -> 0%) and cut total-volume
# error by 24% and 18%, costing 0.5% and 5.3% of per-period MASE.
#
# A constant with an override rather than a hardcoded choice, so
# scripts/experiment_metric.py can still score the old rule against the same
# backtest. Flip this and the comparison is still one command away.
DECISION_ALIGNED_SPARSE = True

# How close on the primary metric counts as a tie, relative to the best score.
# Among models that get the TOTAL right, the tiebreak prefers the one that gets
# the TIMING right.
#
# The sweep is recorded because the conclusion is negative and should not have
# to be rediscovered. VN2, one backtest scored at five tolerances:
#
#   tol    intermittent (320)              lumpy (191)
#          cumulative  near-zero  winner   cumulative  near-zero  winner
#   0.00   0.460       0%         mov_avg  0.514       1%         mov_avg
#   0.01   0.460       0%         mov_avg  0.514       1%         mov_avg
#   0.02   0.460       0%         mov_avg  0.514       1%         mov_avg
#   0.05   0.460       0%         mov_avg  0.540       7%         croston
#   0.10   0.460       0%         mov_avg  0.540       7%         croston
#
# The tiebreak never helped here. Below 0.05 it never fires; at 0.05 and above
# it fires on lumpy and promotes Croston, which buys 0.4% of MASE for 5% more
# error on the number that sizes the order and brings near-zero forecasts back
# from 1% to 7%.
#
# So why keep it at all. The objection it answers is real: `cumulative` is
# `abs(bias)`, so on its own it rewards whichever model is flattest, and a
# constant forecast at the historical mean has almost no bias by construction.
# At 0.02 the mechanism is present and provably inert on our data — two models
# within 2% on the total genuinely are equivalent for the decision, and if a
# customer's data ever produces that tie, timing decides it rather than a coin.
#
# Stated plainly: on VN2 the flattest model does win the sparse classes, and
# this tolerance does not change that. It bounds the problem, it does not
# remove it. Removing it needs a metric that is not a pure total.
TIE_TOLERANCE = 0.02


def primary_metric(demand_class: DemandClass, decision_aligned: bool | None = None) -> str:
    """Which metric decides the winner for this demand class."""
    if decision_aligned is None:
        decision_aligned = DECISION_ALIGNED_SPARSE
    if demand_class in SPARSE_CLASSES:
        return "cumulative" if decision_aligned else "mase"
    return "wape"


def tiebreak_metric(
    demand_class: DemandClass, decision_aligned: bool | None = None
) -> str | None:
    """The secondary metric, or None when the primary decides alone."""
    if decision_aligned is None:
        decision_aligned = DECISION_ALIGNED_SPARSE
    if decision_aligned and demand_class in SPARSE_CLASSES:
        return "mase"
    return None


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
        # Always computed, whether or not it is selecting, so any past run can
        # be re-scored under the other rule without re-running the backtest.
        "cumulative": round(cumulative(actual, predicted), 4),
        "primary": primary_metric(demand_class),
    }
