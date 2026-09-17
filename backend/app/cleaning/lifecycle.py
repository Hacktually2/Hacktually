"""Series lifecycle: is this item still alive, and if not, what does that cost?

A forecastability gate that only asks "does it have enough rows" passes items
nobody has sold in two years. On a real Indonesian public dataset that was 71%
of all series — every one of which would have received a purchase-order
recommendation. Rows are not a pulse.

But the naive fix is worse than the bug in this market. A parcel, a syrup, a box
of dates sells for six weeks a year and is silent for the rest. Kill a series for
being quiet in August and you have deleted exactly the SKUs whose Lebaran peak is
the entire reason this product exists.

So dormancy is decided by three questions, in order:

1. **Is the silence explained by the calendar?** If this item was historically
   silent in these same months, it is seasonal, not dead — and it is the item
   that most needs forecasting.
2. **Is the silence explained by its own rhythm?** An item that normally sells
   every two months is not dormant after ten weeks. The threshold scales with the
   series' own average demand interval.
3. **Only then:** how long past any explanation has it been silent?

What comes out is a lifecycle state per series, and for the genuinely dead ones,
the inventory still sitting against them — because dormant stock is not a data
quality complaint, it is working capital nobody is watching.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
import polars as pl

from ..canonical import INVENTORY, PRICE, SERIES_ID, TARGET, TIMESTAMP, Frequency

# Base idle tolerance in periods, before any scaling.
BASE_IDLE = {Frequency.DAILY: 90, Frequency.WEEKLY: 13, Frequency.MONTHLY: 6}

# An item is allowed to be quiet for this multiple of its own demand interval.
ADI_TOLERANCE = 3.0

# Beyond this many months, no seasonal story survives — two full cycles missed.
SEASONAL_PATIENCE_MONTHS = 20

# Months of history needed before we trust a seasonal profile at all.
MIN_MONTHS_FOR_SEASONALITY = 20


class Lifecycle(str, Enum):
    ACTIVE = "active"
    SEASONAL_DORMANT = "seasonal_dormant"
    SLOW_MOVER = "slow_mover"
    AT_RISK = "at_risk"
    DISCONTINUED = "discontinued"
    NEW = "new"

    @property
    def forecastable(self) -> bool:
        """Seasonal and slow items are forecast — they are the hard, valuable ones."""
        return self in (
            Lifecycle.ACTIVE,
            Lifecycle.SEASONAL_DORMANT,
            Lifecycle.SLOW_MOVER,
            Lifecycle.AT_RISK,
        )


@dataclass
class LifecycleVerdict:
    series_id: str
    state: Lifecycle
    periods_idle: int
    last_active: object | None
    reason: str
    fix: str = ""

    def as_dict(self) -> dict:
        return {
            "series_id": self.series_id,
            "state": self.state.value,
            "periods_idle": self.periods_idle,
            "last_active": str(self.last_active)[:10] if self.last_active else None,
            "reason": self.reason,
            "fix": self.fix,
            "forecastable": self.state.forecastable,
        }


def _months_between(earlier, later) -> int:
    if earlier is None or later is None:
        return 0
    return (later.year - earlier.year) * 12 + (later.month - earlier.month)


def _idle_months(active_months: set[int], last_active, dataset_end) -> set[int]:
    """Calendar months the series has been silent through, as month numbers."""
    months: set[int] = set()
    if last_active is None or dataset_end is None:
        return months
    year, month = last_active.year, last_active.month
    for _ in range(_months_between(last_active, dataset_end) + 1):
        month += 1
        if month > 12:
            month, year = 1, year + 1
        if (year, month) > (dataset_end.year, dataset_end.month):
            break
        months.add(month)
    return months


def classify_series(
    series_id: str,
    timestamps: list,
    values: np.ndarray,
    frequency: Frequency,
    dataset_end,
    adi: float | None = None,
    min_obs: int = 0,
) -> LifecycleVerdict:
    """One series, one verdict."""
    values = np.asarray(values, dtype=float)
    active_idx = np.flatnonzero(values > 0)

    if active_idx.size == 0:
        return LifecycleVerdict(
            series_id, Lifecycle.DISCONTINUED, 10**6, None,
            "no demand recorded in the whole period",
            "confirm this item is still active",
        )

    last_active = timestamps[int(active_idx[-1])]
    first_seen = timestamps[0]
    periods_idle = max(
        0, (dataset_end - last_active).days // max(frequency.days, 1)
    )
    months_idle = _months_between(last_active, dataset_end)
    months_history = _months_between(first_seen, dataset_end)

    # Not enough history to judge anything else.
    if min_obs and len(values) < min_obs:
        return LifecycleVerdict(
            series_id, Lifecycle.NEW, periods_idle, last_active,
            f"only {len(values)} periods of history, need {min_obs}",
            "export a longer date range, or forecast at a coarser frequency",
        )

    base = BASE_IDLE[frequency]

    # Still moving. Nothing else needs deciding.
    if periods_idle <= base:
        return LifecycleVerdict(
            series_id, Lifecycle.ACTIVE, periods_idle, last_active,
            f"active, last movement {str(last_active)[:10]}",
        )

    # Question 1 — the calendar, FIRST. Seasonality is the more specific
    # explanation, so it has to be tested before the rhythm fallback: a Lebaran
    # parcel with ADI 4 would otherwise be filed as a slow mover, which keeps it
    # forecastable but describes it wrongly to the person reading the report.
    if months_history >= MIN_MONTHS_FOR_SEASONALITY and months_idle <= SEASONAL_PATIENCE_MONTHS:
        active_months = {timestamps[int(i)].month for i in active_idx}
        silent_through = _idle_months(active_months, last_active, dataset_end)
        # Never active in the months it is currently silent through -> the
        # silence is the season, not death.
        if silent_through and not (silent_through & active_months):
            return LifecycleVerdict(
                series_id, Lifecycle.SEASONAL_DORMANT, periods_idle, last_active,
                (
                    f"silent {months_idle} months, but historically never sells in "
                    f"month {sorted(silent_through)} — seasonal, not discontinued"
                ),
                "forecast normally; its season has not come round yet",
            )

    # Question 2 — its own rhythm. An item that sells every two months is not
    # dormant after ten weeks, and calling it so would kill every slow mover.
    rhythm_allowance = base
    if adi and np.isfinite(adi) and adi > 1:
        rhythm_allowance = max(base, int(ADI_TOLERANCE * adi))

    if periods_idle <= rhythm_allowance:
        return LifecycleVerdict(
            series_id, Lifecycle.SLOW_MOVER, periods_idle, last_active,
            (
                f"idle {periods_idle} periods, within its own rhythm "
                f"(sells roughly every {adi:.0f} periods)"
            ),
        )

    # Question 3 — silence past any explanation.
    if months_idle > SEASONAL_PATIENCE_MONTHS:
        return LifecycleVerdict(
            series_id, Lifecycle.DISCONTINUED, periods_idle, last_active,
            f"no demand for {months_idle} months (last {str(last_active)[:10]})",
            "confirm whether this item is discontinued, or send fresher data",
        )

    return LifecycleVerdict(
        series_id, Lifecycle.AT_RISK, periods_idle, last_active,
        f"quiet for {months_idle} months, longer than expected but not conclusive",
        "check with the branch before ordering; forecast is low-confidence",
    )


def classify_all(
    df: pl.DataFrame,
    frequency: Frequency,
    adi_by_series: dict[str, float] | None = None,
    min_obs: int = 0,
) -> dict[str, LifecycleVerdict]:
    adi_by_series = adi_by_series or {}
    dataset_end = df.get_column(TIMESTAMP).max()
    verdicts: dict[str, LifecycleVerdict] = {}

    for (series_id,), group in df.sort([SERIES_ID, TIMESTAMP]).group_by(
        [SERIES_ID], maintain_order=True
    ):
        verdicts[series_id] = classify_series(
            series_id,
            group.get_column(TIMESTAMP).to_list(),
            group.get_column(TARGET).to_numpy(),
            frequency,
            dataset_end,
            adi_by_series.get(series_id),
            min_obs,
        )
    return verdicts


def dead_stock(
    df: pl.DataFrame, verdicts: dict[str, LifecycleVerdict]
) -> dict:
    """Inventory still held against items nobody is buying.

    This is the reason the lifecycle check earns its place in the product rather
    than the test suite. "651 series cannot be forecast" is a complaint. "128 of
    them still hold Rp 340 juta of stock" is a finding the customer can act on
    today, before a single forecast is made.
    """
    dormant = {
        sid: v for sid, v in verdicts.items()
        if v.state in (Lifecycle.DISCONTINUED, Lifecycle.AT_RISK)
    }
    if not dormant or INVENTORY not in df.columns:
        return {
            "items": [],
            "count": 0,
            "total_units": 0.0,
            "total_value": None,
            "valued": False,
            "note": (
                "no inventory column in this dataset — dormant items are listed, "
                "but the capital tied up in them cannot be valued"
            ) if dormant else "no dormant items",
        }

    has_price = PRICE in df.columns
    aggs = [pl.col(INVENTORY).last().alias("stock")]
    if has_price:
        aggs.append(pl.col(PRICE).drop_nulls().last().alias("price"))

    latest = (
        df.filter(pl.col(SERIES_ID).is_in(list(dormant)))
        .sort(TIMESTAMP)
        .group_by(SERIES_ID)
        .agg(aggs)
    )

    items = []
    total_units = 0.0
    total_value = 0.0
    for row in latest.iter_rows(named=True):
        stock = float(row["stock"] or 0)
        if stock <= 0:
            continue
        price = float(row.get("price") or 0) if has_price else 0.0
        verdict = dormant[row[SERIES_ID]]
        total_units += stock
        total_value += stock * price
        items.append({
            "series_id": row[SERIES_ID],
            "state": verdict.state.value,
            "units_held": round(stock, 1),
            "value": round(stock * price, 0) if has_price else None,
            "last_active": str(verdict.last_active)[:10] if verdict.last_active else None,
            "periods_idle": verdict.periods_idle,
        })

    items.sort(key=lambda x: -(x["value"] or x["units_held"]))
    return {
        "items": items[:100],
        "count": len(items),
        "total_units": round(total_units, 1),
        "total_value": round(total_value, 0) if has_price else None,
        "valued": has_price,
        "note": (
            "capital sitting against items with no recent demand"
            if has_price
            else "no price column — units only"
        ),
    }


def summary(verdicts: dict[str, LifecycleVerdict]) -> dict[str, int]:
    counts = {state.value: 0 for state in Lifecycle}
    for verdict in verdicts.values():
        counts[verdict.state.value] += 1
    return counts
