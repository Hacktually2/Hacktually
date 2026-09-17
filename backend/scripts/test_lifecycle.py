"""Lifecycle classification tests, written around the ways it can be wrong.

The dangerous failure is not missing a dead item. It is killing a live one — a
Lebaran-only SKU is silent for nine months a year, and a naive staleness rule
deletes exactly the products whose seasonal peak is the reason this product
exists. These cases exist so that cannot regress quietly.

    py -3.11 scripts/test_lifecycle.py
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from app.canonical import Frequency  # noqa: E402
from app.cleaning.lifecycle import Lifecycle, classify_series  # noqa: E402

passed = 0
failed = 0


def check(label: str, got: Lifecycle, want: Lifecycle, why: str = "") -> None:
    global passed, failed
    if got is want:
        passed += 1
        print(f"  PASS  {label:<44} -> {got.value}")
    else:
        failed += 1
        print(f"  FAIL  {label:<44} -> {got.value}, wanted {want.value}")
        if why:
            print(f"        {why}")


def monthly(start: date, months: int) -> list[date]:
    out, y, m = [], start.year, start.month
    for _ in range(months):
        out.append(date(y, m, 1))
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def daily(start: date, days: int) -> list[date]:
    return [start + timedelta(days=i) for i in range(days)]


def main() -> None:
    print("MONTHLY\n")

    # A Lebaran-only item: sells Feb-Apr, silent the rest of the year.
    # Dataset ends in November, so it has been quiet for seven months.
    months = monthly(date(2022, 1, 1), 59)          # Jan 2022 -> Nov 2026
    values = np.array([80.0 if d.month in (2, 3, 4) else 0.0 for d in months])
    check(
        "Lebaran-only SKU, quiet since April",
        classify_series("PARCEL__JKT", months, values, Frequency.MONTHLY,
                        months[-1], adi=4.0, min_obs=18).state,
        Lifecycle.SEASONAL_DORMANT,
        "this is the item the whole product exists to forecast",
    )

    # Same shape, but it missed its own season twice running. That is dead.
    values_dead = values.copy()
    for i, d in enumerate(months):
        if d >= date(2024, 12, 1):
            values_dead[i] = 0.0
    check(
        "seasonal SKU that missed two seasons",
        classify_series("PARCEL_OLD__JKT", months, values_dead, Frequency.MONTHLY,
                        months[-1], adi=4.0, min_obs=18).state,
        Lifecycle.DISCONTINUED,
    )

    # Steady monthly seller, still moving.
    steady = np.full(len(months), 40.0)
    check(
        "steady monthly seller",
        classify_series("RICE__JKT", months, steady, Frequency.MONTHLY,
                        months[-1], adi=1.0, min_obs=18).state,
        Lifecycle.ACTIVE,
    )

    # Genuinely discontinued: stopped two and a half years ago, no seasonality.
    stopped = np.where(np.array(months) < date(2024, 3, 1), 40.0, 0.0)
    check(
        "stopped in early 2024, no seasonal pattern",
        classify_series("OLD__JKT", months, stopped, Frequency.MONTHLY,
                        months[-1], adi=1.0, min_obs=18).state,
        Lifecycle.DISCONTINUED,
    )

    print("\nDAILY\n")

    days = daily(date(2024, 1, 1), 1000)

    # Spare part: sells roughly every 100 days. Silent 110 days is its rhythm,
    # not its death — a fixed 90-day rule would have killed it.
    spare = np.zeros(len(days))
    for i in range(0, len(days) - 110, 100):
        spare[i] = 5.0
    check(
        "slow mover, ADI 100, quiet 110 days",
        classify_series("SPARE__BDG", days, spare, Frequency.DAILY,
                        days[-1], adi=100.0, min_obs=60).state,
        Lifecycle.SLOW_MOVER,
        "a fixed 90-day threshold would have declared this discontinued",
    )

    # Fast mover gone quiet for four months. That is a real problem.
    fast = np.where(np.array(days) < date(2026, 5, 1), 20.0, 0.0)
    check(
        "daily seller silent 4 months",
        classify_series("FAST__JKT", days, fast, Frequency.DAILY,
                        days[-1], adi=1.0, min_obs=60).state,
        Lifecycle.AT_RISK,
    )

    # Brand new SKU: three weeks of history.
    new_days = daily(date(2026, 9, 1), 21)
    check(
        "new SKU, 21 days of history",
        classify_series("NEW__JKT", new_days, np.full(21, 10.0), Frequency.DAILY,
                        new_days[-1], adi=1.0, min_obs=60).state,
        Lifecycle.NEW,
    )

    # Never sold anything at all.
    check(
        "never any demand",
        classify_series("ZERO__JKT", days, np.zeros(len(days)), Frequency.DAILY,
                        days[-1], adi=None, min_obs=60).state,
        Lifecycle.DISCONTINUED,
    )

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
