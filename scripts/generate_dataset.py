#!/usr/bin/env python3
"""Generate one large multi-branch sales export for the auth/branch flow.

This is the file an owner uploads: a single flat CSV covering every branch of a
distributor, which the review screen then asks about ("is this the branch ID
column?") before it is split per branch.

It is deliberately NOT the forecasting backend's fixture generator in
`backend/scripts/make_demo_data.py`. That one produces three differently-shaped
exports to exercise schema mapping. This one produces one realistically messy
export to exercise branch splitting and access control, and writes somewhere
else so the two never collide.

Standard library only, and seeded, so two runs produce the same file.

    python3 scripts/generate_dataset.py [--rows-target N] [--out PATH]
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 42
START = date(2025, 1, 1)
END = date(2026, 6, 30)

# Lebaran 2026. Demand ramps for about three weeks before it and collapses
# during the holiday week itself — the single most load-bearing seasonal effect
# in Indonesian retail, and the reason a flat generator would be useless here.
LEBARAN = date(2026, 3, 20)

OUT_DEFAULT = (
    Path(__file__).resolve().parents[1] / "data" / "generated" / "penjualan_nasional.csv"
)

# The branch network.
#
# Size alone would give 24 dashboards that differ only in their y-axis, which is
# useless for judging whether a screen is worth looking at. Each branch also
# gets a character, and the character is what the dashboards end up arguing
# about:
#
#   scale    how big it is relative to the others
#   trend    demand multiplier across the whole period — below 1 is a branch in
#            decline, which is what "which branch is dying" should surface
#   stock    replenishment discipline. Low means it runs dry often, which shows
#            up as stockouts, censored demand and a worse health score
#   breadth  share of the catalogue it carries, so assortments genuinely differ
BRANCHES = [
    # Jakarta — the mature core: big, well stocked, growing slowly.
    ("CAB-JKT-01", "Jakarta Pusat",   "Cabang Jakarta Pusat",   1.00, 1.08, 0.92, 0.95),
    ("CAB-JKT-02", "Jakarta Timur",   "Cabang Jakarta Timur",   0.86, 1.05, 0.88, 0.90),
    ("CAB-JKT-03", "Jakarta Barat",   "Cabang Jakarta Barat",   0.79, 0.97, 0.74, 0.85),
    ("CAB-JKT-04", "Jakarta Selatan", "Cabang Jakarta Selatan", 0.92, 1.18, 0.90, 0.88),
    ("CAB-BKS-01", "Bekasi",          "Cabang Bekasi",          0.68, 1.22, 0.71, 0.80),
    ("CAB-TNG-01", "Tangerang",       "Cabang Tangerang",       0.74, 1.15, 0.83, 0.82),
    ("CAB-DPK-01", "Depok",           "Cabang Depok",           0.55, 1.09, 0.66, 0.72),
    # West Java — mixed, one clearly struggling.
    ("CAB-BDG-01", "Bandung",         "Cabang Bandung",         0.81, 0.99, 0.86, 0.88),
    ("CAB-BDG-02", "Bandung Timur",   "Cabang Bandung Timur",   0.44, 0.78, 0.58, 0.65),
    ("CAB-CRB-01", "Cirebon",         "Cabang Cirebon",         0.38, 0.92, 0.70, 0.60),
    # Central and East Java.
    ("CAB-SMG-01", "Semarang",        "Cabang Semarang",        0.62, 1.02, 0.81, 0.78),
    ("CAB-SLO-01", "Surakarta",       "Cabang Surakarta",       0.41, 0.95, 0.76, 0.62),
    ("CAB-YOG-01", "Yogyakarta",      "Cabang Yogyakarta",      0.52, 1.12, 0.84, 0.70),
    ("CAB-SBY-01", "Surabaya",        "Cabang Surabaya",        0.94, 1.06, 0.89, 0.92),
    ("CAB-SBY-02", "Surabaya Barat",  "Cabang Surabaya Barat",  0.57, 1.24, 0.63, 0.74),
    ("CAB-MLG-01", "Malang",          "Cabang Malang",          0.47, 1.01, 0.79, 0.66),
    # Bali and Nusa Tenggara — tourist seasonality, thinner assortments.
    ("CAB-DPS-01", "Denpasar",        "Cabang Denpasar",        0.58, 1.14, 0.77, 0.68),
    ("CAB-MTR-01", "Mataram",         "Cabang Mataram",         0.29, 0.88, 0.61, 0.52),
    # Sumatra.
    ("CAB-MDN-01", "Medan",           "Cabang Medan",           0.72, 1.03, 0.80, 0.84),
    ("CAB-PLB-01", "Palembang",       "Cabang Palembang",       0.49, 0.94, 0.68, 0.64),
    ("CAB-PKU-01", "Pekanbaru",       "Cabang Pekanbaru",       0.43, 1.11, 0.72, 0.60),
    ("CAB-PDG-01", "Padang",          "Cabang Padang",          0.35, 0.86, 0.64, 0.56),
    # Kalimantan and Sulawesi — smallest, patchiest, most intermittent.
    ("CAB-BPN-01", "Balikpapan",      "Cabang Balikpapan",      0.33, 1.07, 0.59, 0.50),
    ("CAB-MKS-01", "Makassar",        "Cabang Makassar",        0.51, 0.98, 0.73, 0.66),
]

# (category, base price range, seasonality strength, product names)
CATALOGUE = [
    ("Beras & Biji-bijian", (52_000, 148_000), 1.35, [
        "Beras Premium 5kg", "Beras Medium 10kg", "Beras Merah 2kg",
        "Ketan Putih 1kg", "Jagung Pipil 1kg", "Kacang Hijau 500g",
    ]),
    ("Minyak & Bumbu", (14_000, 62_000), 1.20, [
        "Minyak Goreng 2L", "Minyak Goreng 1L", "Minyak Kelapa 500ml",
        "Kecap Manis 600ml", "Saus Sambal 340ml", "Garam Halus 500g",
        "Gula Pasir 1kg", "Tepung Terigu 1kg",
    ]),
    ("Minuman", (3_500, 48_000), 1.10, [
        "Air Mineral 600ml", "Air Mineral Galon 19L", "Teh Kotak 250ml",
        "Kopi Sachet 10x20g", "Susu UHT 1L", "Sirup Marjan 460ml",
        "Minuman Isotonik 500ml",
    ]),
    ("Makanan Ringan", (6_000, 38_000), 1.45, [
        "Biskuit Kaleng 650g", "Wafer Cokelat 120g", "Keripik Kentang 68g",
        "Kacang Atom 200g", "Permen Mint 125g", "Nastar Kaleng 500g",
        "Kue Kering Mix 400g",
    ]),
    ("Perawatan Rumah", (11_000, 72_000), 0.95, [
        "Deterjen Bubuk 1.8kg", "Sabun Cuci Piring 780ml", "Pewangi Pakaian 900ml",
        "Pembersih Lantai 1L", "Tisu Gulung 4 roll", "Kantong Sampah 30pcs",
    ]),
    ("Perawatan Diri", (9_500, 85_000), 1.05, [
        "Sabun Mandi Cair 450ml", "Sampo 340ml", "Pasta Gigi 190g",
        "Sikat Gigi 2pcs", "Popok Bayi M 40pcs", "Pembalut 24pcs",
        "Deodoran Roll-on 50ml", "Tisu Basah 50pcs",
    ]),
    ("Susu & Sarapan", (12_000, 96_000), 1.15, [
        "Susu Bubuk 800g", "Susu Kental Manis 370g", "Sereal 330g",
        "Oat Instan 400g", "Madu 350ml", "Selai Cokelat 200g",
        "Roti Tawar 400g",
    ]),
    ("Bumbu Dapur", (4_500, 42_000), 1.28, [
        "Bawang Merah 250g", "Bawang Putih 250g", "Cabai Bubuk 100g",
        "Merica Bubuk 50g", "Santan Instan 200ml", "Penyedap Rasa 250g",
        "Kaldu Bubuk 100g", "Tepung Bumbu 250g",
    ]),
    ("Beku & Dingin", (18_000, 120_000), 1.18, [
        "Nugget Ayam 500g", "Sosis Sapi 500g", "Bakso Sapi 500g",
        "Kentang Goreng 1kg", "Es Krim 700ml", "Dimsum 400g",
    ]),
]

HEADER = [
    "tanggal_transaksi",
    "kode_cabang",
    "lokasi_cabang",
    "nama_cabang",
    "kode_produk",
    "nama_produk",
    "kategori",
    "qty_terjual",
    "harga_satuan",
    "stok_akhir",
]


def build_catalogue(rng: random.Random) -> list[dict]:
    """Every SKU the company sells, priced once so prices stay stable per SKU."""
    products = []
    for category, (low, high), seasonality, names in CATALOGUE:
        for name in names:
            price = round(rng.uniform(low, high) / 500) * 500
            products.append({
                "code": f"SKU-{len(products) + 1:04d}",
                "name": name,
                "category": category,
                "price": price,
                "seasonality": seasonality,
                # Baseline daily units before any seasonal or branch effect.
                "base": rng.uniform(4, 30),
                # How erratic this SKU is. A few are lumpy on purpose, so the
                # data is not uniformly well-behaved.
                "noise": rng.choice([0.18, 0.25, 0.35, 0.55]),
            })
    return products


def lebaran_factor(day: date, strength: float) -> float:
    """Ramp up to Lebaran, collapse through the holiday, recover after."""
    offset = (day - LEBARAN).days
    if -24 <= offset < -2:
        # Climbs steeply over the three weeks before.
        return 1.0 + strength * (1.0 - abs(offset + 24) / 24) * 1.6
    if -2 <= offset <= 5:
        return max(0.2, 1.0 - strength * 0.55)
    if 5 < offset <= 20:
        return 1.0 - strength * 0.18 * (1.0 - (offset - 5) / 15)
    return 1.0


def daily_units(
    rng: random.Random,
    product: dict,
    branch_scale: float,
    day: date,
    branch_trend: float = 1.0,
) -> int:
    """Units sold for one SKU at one branch on one day."""
    weekday = day.weekday()
    # Saturday and Sunday are the week's peak for a consumer distributor.
    weekly = 1.28 if weekday >= 5 else 1.0 if weekday >= 3 else 0.88
    # Two trends multiplied: a mild company-wide lift, and the branch's own
    # trajectory. A branch with trend 0.78 ends the period a fifth below where
    # it started while the network grows around it.
    progress = (day - START).days / max(1, (END - START).days)
    trend = (1.0 + 0.16 * progress) * (1.0 + (branch_trend - 1.0) * progress)
    # Payday spike around the 25th-28th.
    payday = 1.22 if 25 <= day.day <= 28 else 1.0
    annual = 1.0 + 0.10 * math.sin(2 * math.pi * day.timetuple().tm_yday / 365)

    mean = (
        product["base"]
        * branch_scale
        * weekly
        * trend
        * payday
        * annual
        * lebaran_factor(day, product["seasonality"])
    )
    units = rng.gauss(mean, mean * product["noise"])
    return max(0, round(units))


def generate(
    out: Path,
    rows_target: int,
    branch_limit: int,
    sku_limit: int,
    months: int,
) -> tuple[int, int, int]:
    rng = random.Random(SEED)
    products = build_catalogue(rng)[:sku_limit]
    branches = BRANCHES[:branch_limit]

    # Each branch stocks its own subset, so the per-branch product counts on the
    # split screen differ instead of all reading the same number.
    # Each branch carries a slice of the catalogue sized by its `breadth`, so a
    # small branch genuinely stocks fewer lines rather than the same lines in
    # smaller numbers.
    assortment = {}
    for code, _city, _name, _scale, _trend, _stock, breadth in branches:
        count = max(8, min(len(products), round(len(products) * breadth)))
        assortment[code] = rng.sample(products, count)

    # Longer history is the cheap way to more rows: it adds no series, and
    # series — not rows — are what the forecast pays for.
    start = END - timedelta(days=round(months * 30.44))
    days = [start + timedelta(days=i) for i in range((END - start).days + 1)]

    # How often a (branch, SKU) pair actually transacts on a given day, tuned to
    # land near the requested row count.
    pairs = sum(len(items) for items in assortment.values())
    density = min(0.95, rows_target / (pairs * len(days)))

    out.parent.mkdir(parents=True, exist_ok=True)
    levels: dict[tuple[str, str], int] = {}
    rows = 0

    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)

        for day in days:
            for code, city, branch_name, scale, trend, stock, _breadth in branches:
                for product in assortment[code]:
                    if rng.random() > density:
                        continue
                    units = daily_units(rng, product, scale, day, trend)
                    if units == 0:
                        continue

                    key = (code, product["code"])
                    # Closing stock walks down with sales and is topped up when
                    # it runs low, so the column looks like a real stock ledger.
                    # `stock` is the branch's replenishment discipline. A low
                    # value reorders later and smaller, so the branch runs dry
                    # more often — which is what makes its dashboard tell a
                    # different story from a well-run one.
                    level = levels.get(key, round(units * rng.uniform(10, 26) * stock) + 12)
                    level -= units
                    if level < units * (2 + 6 * stock):
                        level += round(units * rng.uniform(12, 34) * stock)
                    levels[key] = max(0, level)

                    writer.writerow([
                        day.isoformat(),
                        code,
                        city,
                        branch_name,
                        product["code"],
                        product["name"],
                        product["category"],
                        units,
                        product["price"],
                        levels[key],
                    ])
                    rows += 1

    series = sum(len(items) for items in assortment.values())
    return rows, len(products), series


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--rows-target", type=int, default=500_000,
                        help="approximate number of rows to produce")
    parser.add_argument("--branches", type=int, default=len(BRANCHES),
                        help=f"how many branches to include, up to {len(BRANCHES)}")
    parser.add_argument("--skus", type=int, default=999,
                        help="cap the catalogue. Fewer SKUs means fewer series")
    parser.add_argument("--months", type=int, default=18,
                        help="months of history. More months adds rows, not series")
    args = parser.parse_args()

    rows, skus, series = generate(
        args.out,
        args.rows_target,
        max(1, min(args.branches, len(BRANCHES))),
        max(1, args.skus),
        max(3, args.months),
    )
    size_mb = args.out.stat().st_size / 1024 / 1024

    branch_count = max(1, min(args.branches, len(BRANCHES)))
    print(f"{args.out}")
    print(f"  {rows:,} rows · {branch_count} branches · {skus} SKUs · {size_mb:.1f} MB")
    print(f"  {args.months} months ending {END}, Lebaran {LEBARAN}")
    print(f"  {series:,} series (branch x SKU pairs)")

    # The forecast is priced per series, not per row: 494k rows ingest and clean
    # in seconds, while ~1,100 series backtesting against the foundation models
    # runs for over ten minutes. Say so here, where it can still be changed.
    if series > 600:
        print(f"\n  WARNING: {series:,} series is a long forecast run.")
        print("  Rows are cheap; series are not. For a dataset that finishes")
        print("  quickly, cut SKUs or branches and buy the rows back with history:")
        print("      --branches 12 --skus 28 --months 36")

    # The upload path refuses anything over 64 MB, so say so here rather than
    # letting it fail after the wait.
    if size_mb > 64:
        print(f"\n  WARNING: {size_mb:.1f} MB exceeds the 64 MB upload limit.")
        print("  Use a smaller --rows-target, or upload per branch.")

    growing = sorted(BRANCHES, key=lambda b: -b[4])[:2]
    declining = sorted(BRANCHES, key=lambda b: b[4])[:2]
    leaky = sorted(BRANCHES, key=lambda b: b[5])[:2]
    print("\n  Branches are deliberately unalike, so their dashboards are too:")
    print(f"    growing fastest   {', '.join(b[1] for b in growing)}")
    print(f"    in decline        {', '.join(b[1] for b in declining)}")
    print(f"    worst stocked     {', '.join(b[1] for b in leaky)}")
    print("\n  Upload it as the owner. The review screen asks which column is the")
    print("  branch ID (kode_cabang) and which is the branch location (lokasi_cabang).")


if __name__ == "__main__":
    main()
