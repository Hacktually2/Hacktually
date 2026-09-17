"""Model router.

Demand class decides which models may COMPETE. Backtesting decides which wins.
That distinction is the difference between "TimesFM is SOTA so we use it" and
"the company's own data chose the method".
"""

from __future__ import annotations

from ..canonical import DemandClass
from .base import ForecastModel
from .baselines import CrostonModel, MovingAverageModel, SeasonalNaiveModel, TSBModel
from .calendar_adjusted import CalendarAdjustedModel
from .timesfm_model import TimesFMModel

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
        "timesfm", "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.ERRATIC: (
        "timesfm", "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.INTERMITTENT: ("timesfm", "tsb", "croston", "moving_average"),
    DemandClass.LUMPY: ("timesfm", "croston", "tsb", "moving_average"),
}

_REGISTRY: dict[str, ForecastModel] = {
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


def get_model(name: str) -> ForecastModel:
    if name == "timesfm":
        return TimesFMModel.instance()
    return _REGISTRY[name]


def candidates_for(demand_class: DemandClass, include_timesfm: bool = True) -> list[ForecastModel]:
    """Models allowed to compete for this demand class, minus anything unavailable."""
    names = CANDIDATES[demand_class]
    models: list[ForecastModel] = []
    for name in names:
        if name == "timesfm":
            if not include_timesfm:
                continue
            model = TimesFMModel.instance()
            if not model.available:
                continue
            models.append(model)
        else:
            models.append(_REGISTRY[name])
    return models


def available_model_names() -> list[str]:
    names = list(_REGISTRY)
    if TimesFMModel.instance().available:
        names.append("timesfm")
    return names
