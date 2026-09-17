"""Generate three deliberately different CSV schemas from one underlying truth.

This is Beat 1 of the demo: same pipeline, same canonical output, three exports
that look nothing alike. It is also the fixture the pipeline is tested against.

Demand is built with real Indonesian seasonality — a Lebaran ramp that moves
with the lunar calendar, payday cycles, and a weekly rhythm — so the calendar
covariate has something genuine to find rather than noise we planted to flatter
ourselves.

Uses stdlib + numpy only, so it runs before the heavier deps are installed.

    py -3.11 scripts/make_demo_data.py
"""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np

OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"

START = date(2024, 1, 1)
# Ends about six weeks AFTER Lebaran 2026 (20 Mar), and that is load-bearing.
# The backtest validates on the last two horizon-length windows, so with a
# 30-day horizon one window lands on March and contains the Lebaran ramp.
# End in June instead and both windows are quiet months: the calendar model
# ties with everything else, never wins selection, and the whole moat goes
# unproven. Real exports run to "yesterday", which is the same situation.
END = date(2026, 4, 30)

# Matches backend/app/enrich/calendar.py — keep in sync.
LEBARAN = {2024: date(2024, 4, 10), 2025: date(2025, 3, 31), 2026: date(2026, 3, 20)}

WAREHOUSES = ["JKT01", "SBY01", "BDG01", "MDN01"]
CATEGORIES = ["Makanan", "Minuman", "Perawatan", "Rumah Tangga"]

# (n_items, pattern) — a realistic mid-market mix, not all smooth.
ITEM_MIX = [(28, "smooth"), (14, "erratic"), (10, "intermittent"), (8, "lumpy")]


def days_to_lebaran(day: date) -> int:
    return min((abs((l - day).days), (l - day).days) for l in LEBARAN.values())[1]


def lebaran_multiplier(day: date, sensitivity: float) -> float:
    """Demand ramps for about a month before Lebaran, then collapses during the holiday."""
    gap = days_to_lebaran(day)
    if 0 < gap <= 30:
        # Peaks around H-7, ramping from H-30.
        ramp = 1.0 + sensitivity * (1.0 - abs(gap - 7) / 30.0)
        return max(1.0, ramp)
    if -6 <= gap <= 0:
        return max(0.15, 1.0 - 0.7 * sensitivity)  # shops shut, distribution stops
    return 1.0


def payday_multiplier(day: date) -> float:
    return 1.18 if (day.day >= 25 or day.day <= 5) else 1.0


def weekday_multiplier(day: date) -> float:
    # Saturday busiest, Sunday quietest.
    return [1.0, 0.95, 0.97, 1.0, 1.12, 1.25, 0.72][day.weekday()]


def build_series(rng: random.Random, pattern: str, base: float, sensitivity: float):
    """One item's daily demand across the whole window."""
    values: list[tuple[date, int]] = []
    day = START
    trend = rng.uniform(-0.00015, 0.00035)
    step = 0

    while day <= END:
        seasonal = (
            base
            * lebaran_multiplier(day, sensitivity)
            * payday_multiplier(day)
            * weekday_multiplier(day)
            * (1 + trend * step)
        )

        if pattern == "smooth":
            value = rng.gauss(seasonal, seasonal * 0.12)
        elif pattern == "erratic":
            value = rng.gauss(seasonal, seasonal * 0.55)
            if rng.random() < 0.03:
                value *= rng.uniform(2.0, 3.5)   # bulk order
        elif pattern == "intermittent":
            value = rng.gauss(seasonal, seasonal * 0.2) if rng.random() < 0.28 else 0
        else:  # lumpy
            value = (
                rng.gauss(seasonal * 3.0, seasonal * 1.5) if rng.random() < 0.16 else 0
            )

        values.append((day, max(0, int(round(value)))))
        day += timedelta(days=1)
        step += 1

    return values


def generate() -> list[dict]:
    rng = random.Random(42)
    rows: list[dict] = []
    item_index = 0

    for count, pattern in ITEM_MIX:
        for _ in range(count):
            item_index += 1
            sku = f"SKU-{item_index:03d}"
            category = CATEGORIES[item_index % len(CATEGORIES)]
            # Food and drink spike hardest before Lebaran.
            sensitivity = 2.4 if category in ("Makanan", "Minuman") else 0.9
            base = rng.uniform(18, 140)
            price = round(rng.uniform(5_000, 85_000), -2)
            n_warehouses = rng.choice([1, 2, 2, 3])

            for warehouse in rng.sample(WAREHOUSES, n_warehouses):
                scale = rng.uniform(0.55, 1.5)
                series = build_series(rng, pattern, base * scale, sensitivity)

                inventory = sum(v for _, v in series[:14])
                for day, qty in series:
                    # Inventory drifts down with sales and is replenished roughly
                    # every two weeks, which creates genuine censored periods.
                    inventory = max(0, inventory - qty)
                    if day.day in (1, 15):
                        inventory += int(sum(v for _, v in series[:30]) / 2)

                    shipped = min(qty, inventory + qty)
                    rows.append(
                        {
                            "date": day.isoformat(),
                            "sku": sku,
                            "warehouse": warehouse,
                            "qty": shipped,
                            "inventory": inventory,
                            "price": price,
                            "category": category,
                            "promo": 1 if (0 < days_to_lebaran(day) <= 21) else 0,
                            "pattern": pattern,
                        }
                    )
    return rows


def write_csv(path: Path, rows: list[dict], header: list[str], mapper) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        for row in rows:
            writer.writerow(mapper(row))
    print(f"  {path.name:<32} {len(rows):>7,} rows")


def to_ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def main() -> None:
    print("Generating demo data...")
    rows = generate()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Manufacturer — SimpliDOTS-shaped, Indonesian headers. Hits the preset.
    write_csv(
        OUT_DIR / "manufaktur_simplidots.csv",
        rows,
        ["tgl_order", "kode_brg", "cabang", "qty_out", "harga_net", "disc"],
        lambda r: [
            to_ddmmyyyy(r["date"]), r["sku"], r["warehouse"],
            r["qty"], r["price"], r["promo"],
        ],
    )

    # 2. Distributor — generic English export. Falls through to the rules tier.
    write_csv(
        OUT_DIR / "distributor_generic.csv",
        rows,
        ["invoice_date", "product_code", "branch_id", "units_sold",
         "stock_on_hand", "unit_price", "product_group"],
        lambda r: [
            r["date"], r["sku"], r["warehouse"], r["qty"],
            r["inventory"], r["price"], r["category"],
        ],
    )

    # 3. Retail — awkward spacing and title case, the kind of file people
    #    actually email you. Also exercises revenue-vs-quantity disambiguation.
    write_csv(
        OUT_DIR / "retail_messy.csv",
        rows,
        ["Tanggal Transaksi", "Item No", "Outlet", "Quantity Out",
         "Total Penjualan", "Stok Akhir", "Kategori"],
        lambda r: [
            to_ddmmyyyy(r["date"]), r["sku"], r["warehouse"], r["qty"],
            r["qty"] * r["price"], r["inventory"], r["category"],
        ],
    )

    patterns: dict[str, set] = {}
    for row in rows:
        patterns.setdefault(row["pattern"], set()).add(f"{row['sku']}__{row['warehouse']}")

    print("\nSeries by demand pattern:")
    for pattern, series in sorted(patterns.items()):
        print(f"  {pattern:<14} {len(series):>4} series")
    print(f"\n  {'total':<14} {sum(len(s) for s in patterns.values()):>4} series")
    print(f"\nWritten to {OUT_DIR}")
    print("\nNote: 'Total Penjualan' in retail_messy.csv is revenue, not quantity.")
    print("The mapper must not pick it as the demand column — that is the trap.")


if __name__ == "__main__":
    main()
