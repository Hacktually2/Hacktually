"""A six-branch distributor network, engineered so the node map tells a story.

The other generators make data that exercises the pipeline. This one makes data
that exercises the **branch network view**, which has a different requirement:
the six nodes must land in visibly different colours, because a map where
everything is the same colour teaches the viewer nothing and a map where
everything is red looks like a broken import.

So branch health here is a designed quantity, not an accident. Node colour is
the share of a branch's catalogue that will stock out inside the forecast
horizon, and that share is set per branch by engineering the closing inventory:

    critical   closing cover <= lead time          -> out before a reorder lands
    at risk    lead time < cover <= horizon        -> out inside the horizon
    healthy    cover > horizon                      -> no stockout in view

Everything else is real modelling. Demand carries a weekly rhythm, payday
cycles and a Lebaran ramp that moves with the lunar calendar, in the four
Syntetos-Boylan patterns, so the router and the calendar covariate have
something genuine to find. What is planted is the inventory position, and only
because inventory is the one column that decides colour.

**Say this out loud in a pitch.** The rupiah and the branch colours come from
data we generated. The pipeline, the model competition and the decision rules
are real; this file is a stage, not evidence.

Two outputs:

    penjualan_jaringan.csv   one row per branch/product/day, ~265k rows
    cabang_pic.csv           branch code -> manager name and email

The second one is the multi-branch onboarding path: the owner uploads sales
plus this, and every branch manager gets an account scoped to their branch.
It carries phone numbers in Indonesian format on purpose — upload it and the
personal-data scan should flag them. That is the feature working.

    py -3.11 scripts/make_network_demo.py
"""

from __future__ import annotations

import csv
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np

OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "demo" / "network"

START = date(2024, 1, 1)
# Ends six weeks after Lebaran 2026, and that is load-bearing: the backtest
# validates on the last two horizon-length windows, so one of them has to
# contain a Lebaran ramp or the calendar model never wins selection and the
# claim goes untested. Real exports run to "yesterday", which is the same case.
END = date(2026, 4, 30)

# Keep in sync with backend/app/enrich/calendar.py.
LEBARAN = {2024: date(2024, 4, 10), 2025: date(2025, 3, 31), 2026: date(2026, 3, 20)}

HORIZON = 30          # matches DEFAULT_HORIZON in pipeline_service
LEAD_TIME = 14        # matches BusinessParams.lead_time_days

# code, city, catalogue size, share of catalogue that should need attention.
# The shares are chosen to straddle the legend thresholds in
# components/dashboard/branch-network.tsx (5% / 15% / 30%), so the six nodes
# come out green, amber, orange, orange, red, red rather than all one colour.
# Catalogue sizes differ too, because node area encodes them and six identical
# circles would waste the encoding.
BRANCHES = [
    ("JKT01", "Jakarta Pusat", 86, 0.03),
    ("SBY01", "Surabaya",      68, 0.27),
    ("BDG01", "Bandung",       54, 0.10),
    ("SMG01", "Semarang",      41, 0.20),
    ("MDN01", "Medan",         37, 0.40),
    ("DPS01", "Denpasar",      25, 0.55),
]

# Real names would be a privacy problem in a file we commit, and obviously fake
# ones undercut the demo. These are ordinary Indonesian names with a domain
# that cannot belong to anyone.
PICS = {
    "JKT01": ("Sari Wijaya",    "sari.wijaya@abcdistribution.example",    "081234567801"),
    "SBY01": ("Budi Santoso",   "budi.santoso@abcdistribution.example",   "081234567802"),
    "BDG01": ("Rina Pratiwi",   "rina.pratiwi@abcdistribution.example",   "081234567803"),
    "SMG01": ("Agus Nugroho",   "agus.nugroho@abcdistribution.example",   "081234567804"),
    "MDN01": ("Dewi Lestari",   "dewi.lestari@abcdistribution.example",   "081234567805"),
    "DPS01": ("Putu Ardana",    "putu.ardana@abcdistribution.example",    "081234567806"),
}

CATALOGUE_SIZE = 95
CATEGORIES = ["Makanan", "Minuman", "Perawatan", "Rumah Tangga", "Obat Bebas"]

PRODUCT_WORDS = [
    "Sirup", "Biskuit", "Kopi Sachet", "Teh Kotak", "Minyak Goreng", "Sabun Mandi",
    "Sampo", "Pasta Gigi", "Deterjen", "Kecap Manis", "Saus Sambal", "Mie Instan",
    "Susu UHT", "Air Mineral", "Tisu", "Pewangi", "Madu", "Selai", "Wafer",
    "Krimer", "Gula Pasir", "Beras Premium", "Tepung", "Margarin", "Obat Batuk",
]
PRODUCT_VARIANTS = ["Botol 250ml", "Refill 900ml", "Pak 12", "Sachet 10s", "Kaleng 330ml",
                    "Dus 24", "Pouch 500g", "Tube 75g", "Renceng 6s", "Karton 40"]

# A mid-market mix, weighted to dense demand on purpose.
#
# An earlier version of this file was 34% intermittent and lumpy, which was a
# mistake: the point forecast on a sparse series collapses toward zero, so every
# one of those items rendered as "healthy, order nothing". On a screen built to
# show which branches need attention, a third of the catalogue was silently
# saying "nothing to do". That is the known weak segment — foundation models
# beat a moving average by only 2.0% on intermittent demand — so putting a
# third of the demo on top of it was aiming at our own weakest spot.
#
# Sparse items stay, because a distributor really does have slow movers and the
# demand-class breakdown should not be a fiction. They are just a realistic
# minority now, and they get realistic volumes (see BASE_BY_PATTERN).
PATTERN_MIX = [("smooth", 0.56), ("erratic", 0.32), ("intermittent", 0.08), ("lumpy", 0.04)]

# Volume band per pattern, and this is the part that actually mattered.
#
# Giving sparse items the same base as dense ones produced "slow movers" that
# averaged 55 units a day with gaps — a fast seller with holes in its history,
# not a slow mover. A near-zero forecast against that is catastrophically wrong.
# A real intermittent SKU sells a couple of units a week, and for one of those a
# near-zero forecast is only mildly wrong and "no order needed" is the right
# answer anyway. Same model weakness, two orders of magnitude less damage.
BASE_BY_PATTERN = {
    "smooth": (25.0, 140.0),
    "erratic": (14.0, 90.0),
    "intermittent": (0.7, 4.0),
    "lumpy": (0.5, 2.5),
}


def days() -> list[date]:
    n = (END - START).days + 1
    return [START + timedelta(days=i) for i in range(n)]


def lebaran_factor(day: date) -> float:
    """Demand ramps for about three weeks before Lebaran, then collapses."""
    target = LEBARAN.get(day.year)
    if target is None:
        return 1.0
    gap = (target - day).days
    if 0 <= gap <= 21:
        # Steepest in the final week, which is how Indonesian retail actually
        # behaves — the THR lands and the week before the holiday is the peak.
        return 1.0 + 1.9 * ((22 - gap) / 22) ** 2.2
    if -7 <= gap < 0:
        return 0.42          # shops shut, everyone has travelled
    return 1.0


def seasonal_factor(day: date) -> float:
    weekday = [1.02, 0.94, 0.95, 1.0, 1.14, 1.28, 0.82][day.weekday()]
    # Tanggal muda: demand spikes right after payday.
    payday = 1.22 if day.day <= 5 else (1.08 if day.day >= 25 else 0.96)
    return weekday * payday


def build_catalogue(rng: random.Random) -> list[dict]:
    patterns: list[str] = []
    for name, share in PATTERN_MIX:
        patterns += [name] * round(CATALOGUE_SIZE * share)
    while len(patterns) < CATALOGUE_SIZE:
        patterns.append("smooth")
    patterns = patterns[:CATALOGUE_SIZE]
    rng.shuffle(patterns)

    catalogue = []
    for i in range(CATALOGUE_SIZE):
        word = PRODUCT_WORDS[i % len(PRODUCT_WORDS)]
        variant = PRODUCT_VARIANTS[(i // len(PRODUCT_WORDS)) % len(PRODUCT_VARIANTS)]
        low, high = BASE_BY_PATTERN[patterns[i]]
        catalogue.append({
            "code": f"SKU-{i + 1:03d}",
            "name": f"{word} {variant}",
            "category": CATEGORIES[i % len(CATEGORIES)],
            "pattern": patterns[i],
            "base": round(rng.uniform(low, high), 1),
            "price": float(rng.choice([3500, 5000, 7000, 9500, 12000, 18500, 24000, 41000])),
        })
    return catalogue


def demand_series(item: dict, dates: list[date], rng: np.random.Generator) -> np.ndarray:
    """One item's daily demand, in its own Syntetos-Boylan pattern."""
    base = item["base"]
    pattern = item["pattern"]
    out = np.zeros(len(dates))

    # A slow drift so the series is not stationary, which is what a foundation
    # model is actually good at and a naive baseline is not.
    drift = np.linspace(1.0, rng.uniform(0.85, 1.35), len(dates))

    for t, day in enumerate(dates):
        level = base * seasonal_factor(day) * lebaran_factor(day) * drift[t]

        if pattern == "smooth":
            value = rng.normal(level, level * 0.13)
        elif pattern == "erratic":
            value = rng.normal(level, level * 0.48)
        elif pattern == "intermittent":
            # Sells on about a third of days, ordinary size when it does.
            value = rng.normal(level, level * 0.2) if rng.random() < 0.34 else 0.0
        else:  # lumpy — rare, and large when it happens
            value = rng.normal(level * 3.4, level * 1.1) if rng.random() < 0.16 else 0.0

        out[t] = max(0.0, value)

    return np.round(out, 0)


def closing_cover(needs_attention: bool, rng: random.Random) -> float:
    """Days of stock left on the final day — the number that sets node colour.

    Split so a branch flagged for attention contains both kinds of trouble:
    items already past the point a reorder can save, and items that will run
    out inside the horizon but can still be ordered in time.
    """
    if needs_attention:
        if rng.random() < 0.55:
            return rng.uniform(1.0, LEAD_TIME - 1)        # critical
        return rng.uniform(LEAD_TIME + 2, HORIZON - 1)     # at risk
    # Comfortable, with enough spread that the coverage column is not uniform.
    return rng.uniform(HORIZON + 12, HORIZON + 95)


def stock_series(demand: np.ndarray, final_cover: float, cycle: int = 21) -> np.ndarray:
    """A sawtooth that lands exactly on `final_cover` days on the last row.

    Read forwards it is ordinary replenishment: stock draws down day by day and
    jumps back up when an order arrives. Built backwards from the end, because
    the closing position is the one the decision engine reads and the only one
    this generator needs to control.

    `daily` is the **trailing** mean, not the mean of all history, and that is
    the whole reason this function works. Coverage is judged by walking the
    forecast down from closing stock, and the forecast continues the recent
    level — not the annual average. This file ends six weeks after Lebaran, in
    the post-holiday collapse, so the trailing level sits well below the yearly
    mean. Size stock on the yearly mean and every branch comes out roughly half
    as stressed as intended: measured 1/6/12/16/22/44% against a design of
    3/10/20/27/40/55%.
    """
    tail = demand[-HORIZON:] if len(demand) >= HORIZON else demand
    daily = max(float(np.mean(tail)), 0.1)
    n = len(demand)
    cover = np.array([final_cover + ((n - 1 - t) % cycle) for t in range(n)], dtype=float)
    return np.round(np.maximum(cover * daily, 0.0), 0)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(20260918)
    np_rng = np.random.default_rng(20260918)

    dates = days()
    catalogue = build_catalogue(rng)
    iso = [d.isoformat() for d in dates]

    sales_path = OUT_DIR / "penjualan_jaringan.csv"
    rows_written = 0
    plan: list[tuple] = []

    with sales_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "invoice_date", "product_code", "product_name", "branch_id", "branch_name",
            "units_sold", "stock_on_hand", "unit_price", "product_group",
        ])

        for code, city, catalogue_size, attention_share in BRANCHES:
            # A deterministic subset of the shared catalogue, so the same SKU
            # appears in several branches and the transfer recommendations have
            # something real to move.
            branch_rng = random.Random(f"{code}-catalogue")
            items = branch_rng.sample(catalogue, min(catalogue_size, len(catalogue)))

            # Only non-sparse items can be *made* to look at risk, and that is
            # a finding rather than a convenience. Coverage is judged by walking
            # the forecast down from closing stock, and on an intermittent or
            # lumpy series the point forecast collapses to near zero — TimesFM
            # returned 0.14 units/day for a JKT01 item averaging 55.8 over its
            # last 30 days, because the conditional median of an 84%-zero series
            # is zero. Stock never runs out against a forecast of nothing, so
            # such an item reports healthy at any inventory level.
            #
            # So the sparse items stay in the catalogue, because the router and
            # the demand-class breakdown need them, but the attention share is
            # drawn from the items where inventory actually decides the outcome.
            # Flagging sparse ones would silently miss the target and make this
            # knob untrustworthy.
            dense = [i for i, it in enumerate(items) if it["pattern"] in ("smooth", "erratic")]
            wanted = round(len(items) * attention_share)
            flagged = set(branch_rng.sample(dense, min(wanted, len(dense))))
            if wanted > len(dense):
                print(f"  note: {code} wanted {wanted} flagged items but only "
                      f"{len(dense)} are dense enough; capped.")
            criticals = at_risks = 0

            # Branch scale: a Jakarta hub moves more of everything than Denpasar.
            scale = {"JKT01": 1.9, "SBY01": 1.45, "BDG01": 1.1,
                     "SMG01": 0.85, "MDN01": 0.75, "DPS01": 0.55}[code]

            for index, item in enumerate(items):
                scaled = {**item, "base": item["base"] * scale}
                demand = demand_series(scaled, dates, np_rng)
                cover = closing_cover(index in flagged, branch_rng)
                stock = stock_series(demand, cover)

                if index in flagged:
                    if cover <= LEAD_TIME:
                        criticals += 1
                    else:
                        at_risks += 1

                for t in range(len(dates)):
                    writer.writerow([
                        iso[t], item["code"], item["name"], code, f"Cabang {city}",
                        int(demand[t]), int(stock[t]), item["price"], item["category"],
                    ])
                rows_written += len(dates)

            plan.append((code, city, len(items), criticals, at_risks, attention_share))

    pic_path = OUT_DIR / "cabang_pic.csv"
    with pic_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "kode_cabang", "nama_cabang", "kota", "nama_pic", "email_pic", "telepon_pic",
        ])
        for code, city, *_ in plan:
            name, email, phone = PICS[code]
            writer.writerow([code, f"Cabang {city}", city, name, email, phone])

    # ------------------------------------------------------------------ report
    size_mb = sales_path.stat().st_size / 1_048_576
    total_series = sum(p[2] for p in plan)

    print(f"{sales_path}")
    print(f"  {rows_written:,} rows · {total_series} series · {size_mb:.1f} MB")
    print(f"  {START} to {END}, daily, Lebaran {', '.join(str(d) for d in LEBARAN.values())}")
    print(f"{pic_path}")
    print(f"  {len(plan)} branches mapped to manager emails\n")

    print(f"{'branch':<8}{'city':<16}{'items':>6}{'critical':>10}{'at risk':>9}"
          f"{'attention':>11}  expected node")
    for code, city, items, criticals, at_risks, share in plan:
        actual = (criticals + at_risks) / items if items else 0.0
        colour = (
            "green" if actual < 0.05 else
            "amber" if actual < 0.15 else
            "orange" if actual < 0.30 else "red"
        )
        print(f"{code:<8}{city:<16}{items:>6}{criticals:>10}{at_risks:>9}"
              f"{actual:>10.0%}  {colour}")

    print(
        "\nNote: with the default lead time of 14 days and a 30-day horizon the\n"
        "'watch' risk band is unreachable — it needs coverage above the horizon\n"
        "but below 2x lead time, and 28 < 30. Set lead_time_days to 21 on the\n"
        "dataset to see all four bands:\n"
        '  curl -X PUT localhost:8000/api/v1/datasets/<id>/params \\\n'
        '       -H "Content-Type: application/json" \\\n'
        '       -d \'{"lead_time_days": 21, "unit_cost": 8000, "unit_margin": 2200}\''
    )


if __name__ == "__main__":
    main()
