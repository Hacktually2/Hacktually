"""Calendar-adjusted wrapper — makes the Indonesian calendar work with ANY model.

Why this exists. Only TimesFM can consume covariates natively; seasonal naive,
Croston, TSB and moving average cannot. So without this wrapper the calendar
layer contributes nothing unless TimesFM loads, which would make our one real
differentiator hostage to a checkpoint that may not be available, may be slow,
or may be licence-restricted in production.

This wraps any base model and applies a multiplicative uplift estimated from the
series' own history. It is fitting, not training: ratios of means, computed at
call time, no parameters persisted.

The uplift is estimated PER DISTANCE FROM LEBARAN, not as one flat factor. That
matters and it was learned the hard way: a single multiplier across the whole
30-day run-up scored worse than plain seasonal naive, because the real ramp is
triangular — it builds from about H-30, peaks around H-7 when people shop for
mudik, then collapses for the holiday week itself when distribution stops. A
flat factor over-predicts at both ends of the window and wins nothing.

It is also the honest mechanism to explain on stage. "We measure how much this
item historically lifts in each week before Lebaran, and apply that shape to the
forecast" is a sentence a warehouse manager can check against their own memory,
which matters more than a covariate a judge has to take on faith.
"""

from __future__ import annotations

import numpy as np

from .base import Forecast, ForecastModel, empirical_interval

# Buckets of days_to_lebaran. Signed: positive is before, negative is after.
# Edges chosen to match how the run-up actually behaves rather than round numbers.
LEBARAN_BUCKETS: tuple[tuple[str, int, int], ...] = (
    ("holiday", -7, 0),      # shops shut, distribution stops
    ("peak", 1, 7),          # final shopping week
    ("ramp_near", 8, 14),
    ("ramp_mid", 15, 21),    # THR has landed
    ("ramp_early", 22, 30),
)

DAYS_COL = "days_to_lebaran"
PAYDAY_COL = "is_payday_week"

MIN_OBS_PER_BUCKET = 5
MAX_UPLIFT = 6.0
MIN_UPLIFT = 0.05


def _bucket_for(days: float) -> str | None:
    for name, low, high in LEBARAN_BUCKETS:
        if low <= days <= high:
            return name
    return None


def _baseline_mask(days: np.ndarray, payday: np.ndarray | None) -> np.ndarray:
    """Periods in no special regime at all — the reference level."""
    mask = np.array([_bucket_for(d) is None for d in days], dtype=bool)
    if payday is not None:
        mask &= payday[: len(mask)] <= 0
    return mask


def estimate_uplift(
    history: np.ndarray, covariates: dict[str, np.ndarray] | None
) -> dict[str, float]:
    """Multiplicative lift per bucket, versus periods in no regime.

    Returns {} when there is not enough evidence, which makes the wrapper a
    no-op rather than a source of invented seasonality.
    """
    if not covariates or DAYS_COL not in covariates:
        return {}

    history = np.asarray(history, dtype=float)
    n = history.size
    days = np.asarray(covariates[DAYS_COL], dtype=float)[:n]
    if days.size != n:
        return {}

    payday = covariates.get(PAYDAY_COL)
    payday = np.asarray(payday, dtype=float)[:n] if payday is not None else None

    baseline_mask = _baseline_mask(days, payday)
    if baseline_mask.sum() < MIN_OBS_PER_BUCKET:
        return {}
    baseline_mean = float(history[baseline_mask].mean())
    if baseline_mean <= 0:
        return {}

    uplift: dict[str, float] = {}
    for name, low, high in LEBARAN_BUCKETS:
        mask = (days >= low) & (days <= high)
        if mask.sum() < MIN_OBS_PER_BUCKET:
            continue
        ratio = float(history[mask].mean()) / baseline_mean
        if np.isfinite(ratio):
            uplift[name] = float(np.clip(ratio, MIN_UPLIFT, MAX_UPLIFT))

    if payday is not None:
        mask = (payday > 0) & baseline_mask_compatible(days)
        if mask.sum() >= MIN_OBS_PER_BUCKET:
            ratio = float(history[mask].mean()) / baseline_mean
            if np.isfinite(ratio):
                uplift[PAYDAY_COL] = float(np.clip(ratio, MIN_UPLIFT, MAX_UPLIFT))

    return uplift


def baseline_mask_compatible(days: np.ndarray) -> np.ndarray:
    """Payday lift is measured outside the Lebaran window so the two do not double-count."""
    return np.array([_bucket_for(d) is None for d in days], dtype=bool)


def _historical_factors(
    history: np.ndarray,
    uplift: dict[str, float],
    covariates: dict[str, np.ndarray] | None,
) -> np.ndarray:
    """The calendar factor that applied to each past period.

    Dividing history by this gives the underlying level with Lebaran and payday
    taken out, which is what the base model should actually be forecasting.
    """
    n = history.size
    factors = np.ones(n, dtype=float)
    if not covariates or DAYS_COL not in covariates:
        return factors

    days = np.asarray(covariates[DAYS_COL], dtype=float)[:n]
    payday = covariates.get(PAYDAY_COL)
    payday = np.asarray(payday, dtype=float)[:n] if payday is not None else None

    for i in range(min(n, days.size)):
        bucket = _bucket_for(days[i])
        if bucket and bucket in uplift:
            factors[i] = uplift[bucket]
        elif payday is not None and i < payday.size and payday[i] > 0:
            factors[i] = uplift.get(PAYDAY_COL, 1.0)
    return factors


def apply_uplift(
    point: np.ndarray,
    uplift: dict[str, float],
    future_covariates: dict[str, np.ndarray] | None,
) -> np.ndarray:
    """Scale each future period by its bucket's lift, falling back to payday."""
    if not uplift or not future_covariates or DAYS_COL not in future_covariates:
        return point

    horizon = len(point)
    days = np.asarray(future_covariates[DAYS_COL], dtype=float)
    payday = future_covariates.get(PAYDAY_COL)
    payday = np.asarray(payday, dtype=float) if payday is not None else None

    factors = np.ones(horizon, dtype=float)
    for i in range(horizon):
        if i >= days.size:
            break
        bucket = _bucket_for(days[i])
        if bucket and bucket in uplift:
            factors[i] = uplift[bucket]
        elif payday is not None and i < payday.size and payday[i] > 0:
            factors[i] = uplift.get(PAYDAY_COL, 1.0)

    return point * factors


class CalendarAdjustedModel(ForecastModel):
    """Any base model, plus Indonesian demand seasonality."""

    def __init__(self, base: ForecastModel) -> None:
        self.base = base
        self.name = f"{base.name}+calendar"
        self.needs_gpu = base.needs_gpu

    def forecast(
        self, history, horizon, seasonal_period=7, covariates=None, future_covariates=None
    ) -> Forecast:
        history = np.asarray(history, dtype=float)
        uplift = estimate_uplift(history, covariates)

        if not uplift:
            base_forecast = self.base.forecast(
                history, horizon, seasonal_period, covariates, future_covariates
            )
            return Forecast(
                point=base_forecast.point,
                lower=base_forecast.lower,
                upper=base_forecast.upper,
                model_name=self.name,
            )

        # Classical decomposition: strip the calendar out of history, let the
        # base model forecast the underlying level, then put the calendar back.
        #
        # Forecasting the RAW history and multiplying would double-count. A
        # 28-day moving average taken during the Lebaran run-up is already
        # inflated by that run-up, so scaling it by the run-up factor again
        # over-predicts badly — which is exactly how this scored worse than
        # plain seasonal naive on the most Lebaran-sensitive items.
        past_factors = _historical_factors(history, uplift, covariates)
        deseasonalized = history / np.where(past_factors > 0, past_factors, 1.0)

        base_forecast = self.base.forecast(
            deseasonalized, horizon, seasonal_period, covariates, future_covariates
        )
        adjusted = apply_uplift(base_forecast.point, uplift, future_covariates)

        lower, upper = empirical_interval(deseasonalized, adjusted)
        return Forecast(point=adjusted, lower=lower, upper=upper, model_name=self.name)

    def explain(self, history, covariates) -> dict[str, float]:
        """The uplift factors, for the UI and for explain_forecast."""
        return estimate_uplift(np.asarray(history, dtype=float), covariates)
