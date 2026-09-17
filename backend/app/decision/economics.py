"""Service level from economics, not from a default.

Whether running out or holding too much is worse is a business fact, not a
pattern in sales history. A forecast cannot learn that fresh greens lose more to
spoilage than to a missed sale, or that an anchor product loses a customer for
good when it is out. So the service level is not something a model picks — it is
derived from what the business says each kind of mistake costs.

This is the newsvendor critical ratio:

    service level = cost_short / (cost_short + cost_over)

Two numbers, deliberately, rather than a field per reason. Spoilage, obsolescence,
markdown, expiry and shrinkage are all just reasons a unit left over costs money,
and every industry has its own list. Modelling each one would bake one sector's
concerns into the core schema and need a new field for the next customer. The
business folds whatever applies into `cost_over`; the code stays the same for a
greengrocer and an electronics distributor.

Why this exists at all: on FreshRetailNet, every item got a flat 95% service
level regardless of its economics, and a near-unbiased forecast lost to a
moving average that happened to over-forecast by 2% — that accidental bias was
acting as free safety stock. Deriving the level per item makes the stocking
decision deliberate instead of a side effect of forecast error.

Resolution, most explicit first:

    1. service_level set by the user        -> used as given
    2. cost_short and cost_over supplied     -> critical ratio
    3. margin and unit cost available        -> ratio from those
    4. nothing                               -> 95%, reported as an assumption
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import NormalDist

from ..canonical import BusinessParams

DEFAULT_SERVICE_LEVEL = 0.95

# Clamped away from 0 and 1, where the normal quantile runs to infinity. The
# lower bound is intentionally low: a ratio under 50% is correct for goods where
# a leftover unit costs far more than a missed sale, and means ordering LESS than
# expected demand on purpose.
MIN_SERVICE_LEVEL = 0.01
MAX_SERVICE_LEVEL = 0.995

_NORMAL = NormalDist()


@dataclass
class ServiceLevelDecision:
    level: float
    source: str          # "explicit" | "costs" | "margin" | "default"
    cost_short: float | None
    cost_over: float | None
    detail: str

    def as_dict(self) -> dict:
        return {
            "service_level": round(self.level, 4),
            "source": self.source,
            "cost_short": self.cost_short,
            "cost_over": self.cost_over,
            "detail": self.detail,
        }


def z_score(service_level: float) -> float:
    """Exact normal quantile. Negative below 50%, which is the point.

    Replaces a nearest-value table that started at 50% and snapped anything
    lower up to it — so a perishable with a 6% critical ratio was silently
    stocked as if both mistakes cost the same.
    """
    level = min(MAX_SERVICE_LEVEL, max(MIN_SERVICE_LEVEL, service_level))
    return _NORMAL.inv_cdf(level)


def _critical_ratio(cost_short: float, cost_over: float) -> float | None:
    if cost_short is None or cost_over is None:
        return None
    if cost_short < 0 or cost_over < 0:
        return None
    total = cost_short + cost_over
    if total <= 0:
        return None
    return cost_short / total


def decide(params: BusinessParams, assumed: list[str] | None = None) -> ServiceLevelDecision:
    """Pick the service level, and record where it came from."""
    assumed = set(assumed or [])

    # 1. Someone set it deliberately. Respect that over any derivation.
    if "service_level" not in assumed:
        level = min(MAX_SERVICE_LEVEL, max(MIN_SERVICE_LEVEL, params.service_level))
        return ServiceLevelDecision(
            level, "explicit", params.cost_short, params.cost_over,
            f"set directly to {level:.0%}",
        )

    # 2. The business told us what each mistake costs.
    ratio = _critical_ratio(params.cost_short, params.cost_over)
    if ratio is not None:
        level = min(MAX_SERVICE_LEVEL, max(MIN_SERVICE_LEVEL, ratio))
        leaning = (
            "stock lean — a leftover unit costs more than a missed sale"
            if level < 0.5
            else "stock deep — a missed sale costs more than a leftover unit"
        )
        return ServiceLevelDecision(
            level, "costs", params.cost_short, params.cost_over,
            f"{level:.0%} from shortage {params.cost_short:,.0f} vs overage "
            f"{params.cost_over:,.0f}: {leaning}",
        )

    # 3. Nothing explicit, but margin and cost are known. Shortage loses the
    # margin; overage costs at least the capital to hold the unit. That is the
    # floor for overage — anything perishable should raise cost_over.
    if params.unit_margin > 0 and params.unit_cost > 0:
        cost_short = params.unit_margin
        cost_over = params.unit_cost * params.holding_cost_rate
        ratio = _critical_ratio(cost_short, cost_over)
        if ratio is not None:
            level = min(MAX_SERVICE_LEVEL, max(MIN_SERVICE_LEVEL, ratio))
            return ServiceLevelDecision(
                level, "margin", cost_short, cost_over,
                f"{level:.0%} from margin {cost_short:,.0f} vs holding "
                f"{cost_over:,.0f} — raise cost_over if this item spoils or dates",
            )

    # 4. Nothing to go on. Say so rather than presenting 95% as a finding.
    return ServiceLevelDecision(
        DEFAULT_SERVICE_LEVEL, "default", None, None,
        "assumed 95% — no costs supplied for this item",
    )
