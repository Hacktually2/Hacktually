"""Split the demo data into per-branch files, each in a DIFFERENT export format.

This is the multi-branch story made concrete: four branch managers, four
systems, four sets of column names, one consolidated forecast. Jakarta runs
SimpliDOTS, Surabaya runs Jubelio, Bandung exports from Accurate, Medan sends
the spreadsheet somebody maintains by hand.

    py -3.11 scripts/make_branch_files.py
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

DEMO_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"
OUT_DIR = DEMO_DIR / "branches"
SOURCE = DEMO_DIR / "distributor_generic.csv"

# branch -> (filename, system, header, row builder)
FORMATS = {
    "JKT01": (
        "cabang_jakarta_simplidots.csv",
        "SimpliDOTS",
        ["tgl_order", "kode_brg", "cabang", "qty_out", "harga_net"],
        lambda r: [_ddmmyyyy(r["invoice_date"]), r["product_code"], r["branch_id"],
                   r["units_sold"], r["unit_price"]],
    ),
    "SBY01": (
        "cabang_surabaya_jubelio.csv",
        "Jubelio",
        ["order_date", "item_code", "location_name", "qty", "available_qty", "price"],
        lambda r: [r["invoice_date"], r["product_code"], r["branch_id"],
                   r["units_sold"], r["stock_on_hand"], r["unit_price"]],
    ),
    "BDG01": (
        "cabang_bandung_accurate.csv",
        "Accurate",
        ["Tanggal", "No Barang", "Gudang", "Kuantitas", "Harga Satuan", "Kategori"],
        lambda r: [_ddmmyyyy(r["invoice_date"]), r["product_code"], r["branch_id"],
                   r["units_sold"], r["unit_price"], r["product_group"]],
    ),
    "MDN01": (
        "cabang_medan_excel.csv",
        "hand-maintained spreadsheet",
        ["Tgl", "Kode Produk", "Cabang", "Keluar", "Sisa Stok"],
        lambda r: [_ddmmyyyy(r["invoice_date"]), r["product_code"], r["branch_id"],
                   r["units_sold"], r["stock_on_hand"]],
    ),
}


def _ddmmyyyy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def main() -> None:
    if not SOURCE.exists():
        print(f"Missing {SOURCE}. Run make_demo_data.py first.")
        raise SystemExit(1)

    rows_by_branch: dict[str, list[dict]] = defaultdict(list)
    with SOURCE.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows_by_branch[row["branch_id"]].append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Writing per-branch files to {OUT_DIR}\n")

    for branch, rows in sorted(rows_by_branch.items()):
        if branch not in FORMATS:
            continue
        filename, system, header, builder = FORMATS[branch]
        path = OUT_DIR / filename
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            for row in rows:
                writer.writerow(builder(row))
        print(f"  {branch}  {filename:<36} {len(rows):>6,} rows  ({system})")

    print("\nFour branches, four different column layouts, one dataset.")


if __name__ == "__main__":
    main()
