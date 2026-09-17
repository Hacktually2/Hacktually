"""Model router.

Demand class decides which models may COMPETE. Backtesting decides which wins.
That distinction is the difference between "TimesFM is SOTA so we use it" and
"the company's own data chose the method".

Two foundation models sit behind the same interface. TiRex-2 is the production
engine because it is Apache 2.0 and can actually be deployed commercially;
TimesFM-3 runs alongside it as a benchmark, since its weights are restricted to
non-commercial use. Either may be absent at runtime and the router just drops it.
"""

from __future__ import annotations

from ..canonical import DemandClass
from .base import ForecastModel
from .baselines import CrostonModel, MovingAverageModel, SeasonalNaiveModel, TSBModel
from .calendar_adjusted import CalendarAdjustedModel
from .timesfm_model import TimesFMModel
from .tirex_model import TiRexModel

# Loaded lazily as singletons, and skipped entirely when the package or
# checkpoint is missing. Never construct these per request.
FOUNDATION_MODELS: dict[str, type] = {
    "tirex": TiRexModel,
    "timesfm": TimesFMModel,
}

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
        "tirex", "timesfm", "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.ERRATIC: (
        "tirex", "timesfm", "seasonal_naive", "moving_average",
        "moving_average+calendar", "seasonal_naive+calendar",
    ),
    DemandClass.INTERMITTENT: ("tirex", "timesfm", "tsb", "croston", "moving_average"),
    DemandClass.LUMPY: ("tirex", "timesfm", "croston", "tsb", "moving_average"),
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
    if name in FOUNDATION_MODELS:
        return FOUNDATION_MODELS[name].instance()
    return _REGISTRY[name]


def candidates_for(
    demand_class: DemandClass, include_foundation: bool = True
) -> list[ForecastModel]:
    """Models allowed to compete for this demand class, minus anything unavailable."""
    models: list[ForecastModel] = []
    for name in CANDIDATES[demand_class]:
        if name in FOUNDATION_MODELS:
            if not include_foundation:
                continue
            model = FOUNDATION_MODELS[name].instance()
            if not model.available:
                continue
            models.append(model)
        else:
            models.append(_REGISTRY[name])
    return models


def available_model_names() -> list[str]:
    names = list(_REGISTRY)
    for name, cls in FOUNDATION_MODELS.items():
        if cls.instance().available:
            names.append(name)
    return names


def foundation_status() -> dict[str, dict]:
    """Surfaced on /health so the team knows which engines actually loaded."""
    status = {}
    for name, cls in FOUNDATION_MODELS.items():
        model = cls.instance()
        status[name] = {
            "available": model.available,
            "error": model.error or None,
            "licence": "Apache-2.0" if name == "tirex" else "non-commercial weights",
        }
    return status
