"""Inventory decision engine.

Forecast plus business parameters. Never invent a missing parameter — ask, or
return the forecast alone.

Every recommendation is explainable as a sum. If we cannot show the arithmetic,
we are a black box and an ops lead will not act on it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..canonical import BusinessParams, DecisionMode
from . import economics

# Service level -> z. Enough granularity for the levels anyone actually picks.
Z_TABLE = {0.50: 0.00, 0.80: 0.84, 0.85: 1.04, 0.90: 1.28, 0.95: 1.65, 0.98: 2.05, 0.99: 2.33}

RISK_HIGH_DAYS = 7
RISK_MEDIUM_DAYS = 21


def z_for(service_level: float) -> float:
    """Exact normal quantile.

    Used to snap to the nearest of a handful of table values starting at 50%, so
    a 6% critical ratio for a perishable was silently stocked at 50%. Kept as a
    name because other modules import it.
    """
    return economics.z_score(service_level)


@dataclass
class Recommendation:
    series_id: str
    mode: DecisionMode
    recommended_qty: float
    stockout_risk: str
    days_until_stockout: int | None
    current_inventory: float | None
    demand_over_lead_time: float
    safety_stock: float
    explanation: list[dict] = field(default_factory=list)
    missing_params: list[str] = field(default_factory=list)
    raw_material_qty: float | None = None
    service_level: dict | None = None

    def as_dict(self) -> dict:
        return {
            "series_id": self.series_id,
            "mode": self.mode.value,
            "recommended_qty": round(self.recommended_qty, 1),
            "stockout_risk": self.stockout_risk,
            "days_until_stockout": self.days_until_stockout,
            "current_inventory": self.current_inventory,
            "demand_over_lead_time": round(self.demand_over_lead_time, 1),
            "safety_stock": round(self.safety_stock, 1),
            "explanation": self.explanation,
            "missing_params": self.missing_params,
            "raw_material_qty": (
                round(self.raw_material_qty, 1) if self.raw_material_qty is not None else None
            ),
            "service_level": self.service_level,
        }


def days_until_stockout(
    forecast: np.ndarray, current_inventory: float, period_days: int = 1
) -> int | None:
    """Walk the forecast down from current stock. None if it never runs out."""
    if current_inventory is None:
        return None
    remaining = float(current_inventory)
    for i, demand in enumerate(forecast):
        remaining -= float(demand)
        if remaining <= 0:
            return i * period_days
    return None


def risk_level(days: int | None) -> str:
    if days is None:
        return "low"
    if days <= RISK_HIGH_DAYS:
        return "high"
    if days <= RISK_MEDIUM_DAYS:
        return "medium"
    return "low"


def recommend(
    series_id: str,
    forecast: np.ndarray,
    params: BusinessParams,
    current_inventory: float | None,
    mode: DecisionMode = DecisionMode.RITEL,
    error_std: float | None = None,
    period_days: int = 1,
    assumed: list[str] | None = None,
) -> Recommendation:
    forecast = np.asarray(forecast, dtype=float)
    missing: list[str] = []

    periods_in_lead_time = max(1, int(round(params.lead_time_days / max(period_days, 1))))
    covered = forecast[:periods_in_lead_time]
    demand_over_lead_time = float(covered.sum())

    # Safety stock covers FORECAST ERROR, not the movement of the forecast
    # itself. error_std is the backtest RMSE for the model that won this series,
    # so a model that predicts well earns a smaller buffer. Sizing on the
    # forecast's own spread would instead reward a flat, uninformative forecast
    # with a near-zero buffer and punish one that captures seasonality.
    if error_std is None:
        # No backtest available: fall back to the demand level, deliberately
        # conservative, and say so in the explanation.
        error_std = float(forecast.mean() * 0.5) if forecast.size else 0.0
        missing.append("backtest_error")

    # Service level is derived from what each mistake costs, not taken as a
    # flat default. Below 50% the z-score goes negative and the buffer becomes
    # a deliberate trim — ordering under expected demand because a leftover
    # unit costs more than a missed sale.
    level = economics.decide(params, assumed)
    z = economics.z_score(level.level)
    safety_stock = float(z * error_std * np.sqrt(periods_in_lead_time))

    required = demand_over_lead_time + safety_stock

    if current_inventory is None:
        missing.append("current_inventory")
        inventory = 0.0
    else:
        inventory = float(current_inventory)

    raw_reorder = max(0.0, required - inventory)

    if params.moq > 0:
        recommended = float(np.ceil(raw_reorder / params.moq) * params.moq)
        moq_adjustment = recommended - raw_reorder
    else:
        recommended = raw_reorder
        moq_adjustment = 0.0

    explanation = [
        {
            "label": f"Demand during {params.lead_time_days}-day lead time",
            "value": round(demand_over_lead_time, 1),
        },
        {
            "label": (
                f"Safety buffer at {level.level:.0%} service level"
                if safety_stock >= 0
                else f"Lean trim at {level.level:.0%} — overstock costs more"
            ),
            "value": round(safety_stock, 1),
        },
        {"label": "Current stock", "value": -round(inventory, 1)},
    ]
    if moq_adjustment > 0:
        explanation.append({"label": f"MOQ rounding (MOQ {params.moq:g})", "value": round(moq_adjustment, 1)})

    stockout_days = days_until_stockout(forecast, current_inventory, period_days)

    raw_material = None
    if mode is DecisionMode.MANUFAKTUR and params.bom_factor:
        raw_material = recommended * params.bom_factor

    return Recommendation(
        series_id=series_id,
        mode=mode,
        recommended_qty=recommended,
        stockout_risk=risk_level(stockout_days),
        days_until_stockout=stockout_days,
        current_inventory=current_inventory,
        demand_over_lead_time=demand_over_lead_time,
        safety_stock=safety_stock,
        explanation=explanation,
        missing_params=missing,
        raw_material_qty=raw_material,
        service_level=level.as_dict(),
    )


def rank(recommendations: list[Recommendation]) -> list[Recommendation]:
    """The action list. Soonest stockout first, then largest order."""
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted(
        recommendations,
        key=lambda r: (
            order.get(r.stockout_risk, 3),
            r.days_until_stockout if r.days_until_stockout is not None else 10**6,
            -r.recommended_qty,
        ),
    )
