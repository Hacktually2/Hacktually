"""Decision-consistent backtest — the money slide.

Do not compare WAPE. Run the same replenishment policy under both forecasts
across the backtest windows and count what actually happens: fill rate,
stockouts, inventory held, sales lost.

The baseline is a moving average, which is what the customer is most likely
doing in Excel today. Not a strawman.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..canonical import BusinessParams
from . import economics


@dataclass
class SimulationResult:
    label: str
    fill_rate: float
    stockout_events: int
    avg_inventory_units: float
    avg_inventory_value: float
    lost_sales_units: float
    lost_margin: float
    holding_cost: float

    @property
    def total_cost(self) -> float:
        return self.lost_margin + self.holding_cost

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "fill_rate": round(self.fill_rate, 4),
            "stockout_events": self.stockout_events,
            "avg_inventory_units": round(self.avg_inventory_units, 1),
            "avg_inventory_value": round(self.avg_inventory_value, 0),
            "lost_sales_units": round(self.lost_sales_units, 1),
            "lost_margin": round(self.lost_margin, 0),
            "holding_cost": round(self.holding_cost, 0),
            "total_cost": round(self.total_cost, 0),
        }


def simulate(
    actual: np.ndarray,
    forecast_fn,
    params: BusinessParams,
    label: str,
    period_days: int = 1,
    assumed: list[str] | None = None,
) -> SimulationResult:
    """Period-by-period replenishment under one forecasting policy.

    forecast_fn(t) returns the forecast for the lead-time window starting at t.
    Both policies face identical demand and identical constraints, so the only
    difference is the forecast driving the order.
    """
    periods_in_lead_time = max(1, int(round(params.lead_time_days / max(period_days, 1))))
    # Both policies are simulated at the same derived service level, so the
    # comparison isolates the forecast. If one policy were allowed a different
    # stocking target, the result would measure the target, not the forecast.
    z = economics.z_score(economics.decide(params, assumed).level)

    # Start both policies with the same stock so neither gets an advantage.
    inventory = float(np.mean(actual[:periods_in_lead_time]) * periods_in_lead_time)
    pipeline: dict[int, float] = {}

    served = 0.0
    demanded = 0.0
    lost = 0.0
    stockouts = 0
    inventory_levels: list[float] = []

    # Safety stock is driven by FORECAST ERROR, not by how much the forecast
    # itself moves. Using the forecast's own variance would hand a flat
    # moving-average policy zero safety stock and make it look capital-efficient
    # purely for being uninformative. A better forecast earns a smaller buffer.
    one_step_errors: list[float] = []
    MIN_ERRORS = 5

    for t, demand in enumerate(actual):
        inventory += pipeline.pop(t, 0.0)

        shipped = min(inventory, float(demand))
        inventory -= shipped
        served += shipped
        demanded += float(demand)
        if shipped < demand:
            lost += float(demand) - shipped
            stockouts += 1

        inventory_levels.append(inventory)

        # Place an order when projected cover falls below the reorder point.
        predicted = forecast_fn(t + 1)
        if predicted is None or len(predicted) == 0:
            continue
        window = np.asarray(predicted[:periods_in_lead_time], dtype=float)
        expected = float(window.sum())

        # Record how wrong this policy's next-period call turns out to be.
        if t + 1 < len(actual):
            one_step_errors.append(float(actual[t + 1]) - float(window[0]))

        if len(one_step_errors) >= MIN_ERRORS:
            sigma = float(np.std(one_step_errors, ddof=0))
        elif t > 2:
            sigma = float(np.std(actual[: t + 1], ddof=0))
        else:
            sigma = 0.0

        safety = float(z * sigma * np.sqrt(periods_in_lead_time))
        on_order = sum(pipeline.values())
        gap = expected + safety - inventory - on_order

        if gap > 0:
            qty = gap
            if params.moq > 0:
                qty = float(np.ceil(gap / params.moq) * params.moq)
            arrival = t + 1 + periods_in_lead_time
            pipeline[arrival] = pipeline.get(arrival, 0.0) + qty

    avg_inventory = float(np.mean(inventory_levels)) if inventory_levels else 0.0
    fill_rate = (served / demanded) if demanded > 0 else 1.0
    periods_per_year = 365 / max(period_days, 1)
    holding = (
        avg_inventory
        * params.unit_cost
        * params.holding_cost_rate
        * (len(actual) / periods_per_year)
    )

    return SimulationResult(
        label=label,
        fill_rate=fill_rate,
        stockout_events=stockouts,
        avg_inventory_units=avg_inventory,
        avg_inventory_value=avg_inventory * params.unit_cost,
        lost_sales_units=lost,
        lost_margin=lost * params.unit_margin,
        holding_cost=holding,
    )


def compare(
    baseline: SimulationResult, proposed: SimulationResult, n_series: int, n_periods: int
) -> dict:
    """The slide. Deltas in the units a buyer thinks in.

    One rule this function exists to enforce: do NOT add working capital to
    margin. Capital tied up in stock is a balance-sheet stock; margin lost to
    stockouts is a flow over the period. Summing them produces a number with no
    meaning, and the sign flips depending on how expensive the goods are.

    Total benefit therefore compares total RELEVANT COST — lost margin plus
    holding cost, both flows over the same window. The change in working capital
    is reported beside it, never inside it, because serving more demand usually
    does mean holding more stock and hiding that would be dishonest.
    """
    margin_recovered = baseline.lost_margin - proposed.lost_margin
    holding_delta = baseline.holding_cost - proposed.holding_cost
    working_capital_freed = baseline.avg_inventory_value - proposed.avg_inventory_value

    return {
        "baseline": baseline.as_dict(),
        "proposed": proposed.as_dict(),
        "delta": {
            "fill_rate_points": round((proposed.fill_rate - baseline.fill_rate) * 100, 1),
            "stockout_events_avoided": baseline.stockout_events - proposed.stockout_events,
            "lost_sales_units_avoided": round(
                baseline.lost_sales_units - proposed.lost_sales_units, 1
            ),
            "margin_recovered": round(margin_recovered, 0),
            "holding_cost_change": round(-holding_delta, 0),
            # Flow vs flow. This is the honest headline.
            "total_benefit": round(margin_recovered + holding_delta, 0),
            # Balance-sheet effect, reported separately. Negative = more stock held.
            "working_capital_freed": round(working_capital_freed, 0),
            "working_capital_note": (
                "more stock held to serve more demand"
                if working_capital_freed < 0
                else "less stock needed for the same service"
            ),
        },
        "scope": {"series": n_series, "periods": n_periods},
    }
