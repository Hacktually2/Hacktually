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

OUT_DEFAULT = Path(__file__).resolve().parents[1] / "data" / "generated" / "penjualan_abc_distribution.csv"

# (code, city, branch name, demand scale) — scale is how big the branch is
# relative to the others, so the split screen shows branches of different sizes.
BRANCHES = [
    ("CAB-JKT-01", "Jakarta Pusat", "Cabang Jakarta Pusat", 1.00),
    ("CAB-JKT-02", "Jakarta Timur", "Cabang Jakarta Timur", 0.82),
    ("CAB-BDG-01", "Bandung", "Cabang Bandung", 0.71),
    ("CAB-SBY-01", "Surabaya", "Cabang Surabaya", 0.88),
    ("CAB-SMG-01", "Semarang", "Cabang Semarang", 0.54),
    ("CAB-MDN-01", "Medan", "Cabang Medan", 0.63),
    ("CAB-MKS-01", "Makassar", "Cabang Makassar", 0.47),
    ("CAB-DPS-01", "Denpasar", "Cabang Denpasar", 0.39),
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


def daily_units(rng: random.Random, product: dict, branch_scale: float, day: date) -> int:
    """Units sold for one SKU at one branch on one day."""
    weekday = day.weekday()
    # Saturday and Sunday are the week's peak for a consumer distributor.
    weekly = 1.28 if weekday >= 5 else 1.0 if weekday >= 3 else 0.88
    # A mild upward trend across the 18 months.
    trend = 1.0 + 0.16 * ((day - START).days / max(1, (END - START).days))
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


def generate(out: Path, rows_target: int) -> tuple[int, int]:
    rng = random.Random(SEED)
    products = build_catalogue(rng)

    # Each branch stocks its own subset, so the per-branch product counts on the
    # split screen differ instead of all reading the same number.
    assortment = {
        code: rng.sample(products, rng.randint(int(len(products) * 0.62), len(products)))
        for code, *_ in BRANCHES
    }

    days = [START + timedelta(days=i) for i in range((END - START).days + 1)]

    # How often a (branch, SKU) pair actually transacts on a given day, tuned to
    # land near the requested row count.
    pairs = sum(len(items) for items in assortment.values())
    density = min(0.95, rows_target / (pairs * len(days)))

    out.parent.mkdir(parents=True, exist_ok=True)
    stock: dict[tuple[str, str], int] = {}
    rows = 0

    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)

        for day in days:
            for code, city, branch_name, scale in BRANCHES:
                for product in assortment[code]:
                    if rng.random() > density:
                        continue
                    units = daily_units(rng, product, scale, day)
                    if units == 0:
                        continue

                    key = (code, product["code"])
                    # Closing stock walks down with sales and is topped up when
                    # it runs low, so the column looks like a real stock ledger.
                    level = stock.get(key, round(units * rng.uniform(14, 30)) + 20)
                    level -= units
                    if level < units * 5:
                        level += round(units * rng.uniform(20, 40))
                    stock[key] = max(0, level)

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
                        stock[key],
                    ])
                    rows += 1

    return rows, len(products)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--rows-target", type=int, default=140_000,
                        help="approximate number of rows to produce")
    args = parser.parse_args()

    rows, skus = generate(args.out, args.rows_target)
    size_mb = args.out.stat().st_size / 1024 / 1024

    print(f"{args.out}")
    print(f"  {rows:,} rows · {len(BRANCHES)} branches · {skus} SKUs · {size_mb:.1f} MB")
    print(f"  {START} to {END}, Lebaran {LEBARAN}")
    print("\nUpload it as the owner; the review screen asks which column is the")
    print("branch ID (kode_cabang) and which is the branch location (lokasi_cabang).")


if __name__ == "__main__":
    main()
