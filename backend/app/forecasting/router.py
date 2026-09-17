"""Model router.

Demand class decides which models may COMPETE. Backtesting decides which wins.
That distinction is the difference between "TimesFM is SOTA so we use it" and
"the company's own data chose the method".

Both foundation models run on the remote GPU service. That service takes no
covariates, so each one also competes in a `+calendar` form: the same remote
forecast with the Indonesian Lebaran uplift applied on top. Whether the calendar
correction actually helps is then decided by backtest per series, not assumed.

TiRex-2 is the production engine because it is Apache-2.0 and can ship;
TimesFM-3's weights are research-only, so it runs as a benchmark.
"""

from __future__ import annotations

from ..canonical import DemandClass
from .base import ForecastModel
from .baselines import CrostonModel, MovingAverageModel, SeasonalNaiveModel, TSBModel
from .calendar_adjusted import CalendarAdjustedModel
from .remote_model import timesfm, tirex

# Names whose availability depends on the GPU service being reachable.
FOUNDATION_BASE = ("tirex", "timesfm")
FOUNDATION_NAMES = FOUNDATION_BASE + tuple(f"{n}+calendar" for n in FOUNDATION_BASE)

# moving_average competes everywhere on purpose. It is the customer's current
# practice, and a backtest that excludes the incumbent is not a backtest — we
# would be forcing a choice and then benchmarking it against the option we
# refused to consider. If Excel is already optimal for an item, the honest
# product says so and uses it.
CANDIDATES: dict[DemandClass, tuple[str, ...]] = {
    # seasonal_naive+calendar must be offered here, not just to erratic series.
    # Smooth demand is dominated by the weekly rhythm, so a calendar wrapper on a
    # flat moving average loses to plain seasonal naive every time and the Lebaran
    # correction never gets picked. Wrapping the model that already captures the
    # week is what lets both effects show up at once.
    DemandClass.SMOOTH: (
        "tirex", "tirex+calendar", "timesfm", "timesfm+calendar",
        "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.ERRATIC: (
        "tirex", "tirex+calendar", "timesfm", "timesfm+calendar",
        "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.INTERMITTENT: (
        "tirex", "tirex+calendar", "timesfm",
        "tsb", "croston", "moving_average",
    ),
    DemandClass.LUMPY: (
        "tirex", "tirex+calendar", "timesfm",
        "croston", "tsb", "moving_average",
    ),
}

_LOCAL: dict[str, ForecastModel] = {
    "seasonal_naive": SeasonalNaiveModel(),
    "moving_average": MovingAverageModel(),
    "croston": CrostonModel(),
    "tsb": TSBModel(),
    # Indonesian calendar correction on top of the two models most likely to
    # miss a Lebaran ramp. Competes like anything else — it only wins where the
    # uplift is real in that company's own history.
    "moving_average+calendar": CalendarAdjustedModel(MovingAverageModel()),
    "seasonal_naive+calendar": CalendarAdjustedModel(SeasonalNaiveModel()),
}

BASELINE_FOR_VALUE_SIM = "moving_average"

_remote_cache: dict[str, ForecastModel] = {}


def _remote(name: str) -> ForecastModel:
    """Foundation models are singletons; the +calendar form wraps the same one."""
    if name not in _remote_cache:
        base = timesfm() if name.startswith("timesfm") else tirex()
        _remote_cache[name] = (
            CalendarAdjustedModel(base) if name.endswith("+calendar") else base
        )
    return _remote_cache[name]


def get_model(name: str) -> ForecastModel:
    if name in FOUNDATION_NAMES:
        return _remote(name)
    return _LOCAL[name]


def _foundation_available(name: str) -> bool:
    base = timesfm() if name.startswith("timesfm") else tirex()
    return base.available


def candidates_for(
    demand_class: DemandClass, include_foundation: bool = True
) -> list[ForecastModel]:
    """Models allowed to compete for this demand class, minus anything unavailable."""
    models: list[ForecastModel] = []
    for name in CANDIDATES[demand_class]:
        if name in FOUNDATION_NAMES:
            if not include_foundation or not _foundation_available(name):
                continue
            models.append(_remote(name))
        else:
            models.append(_LOCAL[name])
    return models


def available_model_names() -> list[str]:
    names = list(_LOCAL)
    names += [n for n in FOUNDATION_NAMES if _foundation_available(n)]
    return names


def foundation_status() -> dict[str, dict]:
    """Surfaced on /health so the team knows which engines actually loaded."""
    status = {}
    for name in FOUNDATION_BASE:
        model = timesfm() if name == "timesfm" else tirex()
        status[name] = {
            "available": model.available,
            "error": model.error or None,
            "licence": model.licence,
            "role": "production engine" if name == "tirex" else "benchmark",
        }
    return status
