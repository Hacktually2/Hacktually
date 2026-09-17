"""Mapping override tests, in both directions.

The review screen sends { source_column: canonical_key }. Before the fix the
backend only read { canonical: source_column }, so every correction a user made
was discarded without an error. These cases pin both directions down.

    py -3.11 scripts/test_overrides.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import polars as pl  # noqa: E402

from app.db import database as db  # noqa: E402
from app.services import pipeline_service as svc  # noqa: E402

DEMO = Path(__file__).resolve().parents[2] / "data" / "demo" / "distributor_generic.csv"

passed = 0
failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def fresh(frame: pl.DataFrame | None = None, name: str = "t.csv") -> str:
    payload = (frame if frame is not None else pl.read_csv(DEMO)).write_csv().encode()
    return svc.ingest(name, payload)["dataset_id"]


def current(ds: str) -> dict[str, str]:
    fields = svc.get_mapping(ds)["mapping"]["fields"]
    return {f["canonical"]: f["source_column"] for f in fields if f["source_column"]}


def main() -> None:
    db.init()

    print("CONTRACT DIRECTION  { source_column: canonical_key }\n")

    ds = fresh()
    svc.confirm_mapping(ds, {"stock_on_hand": "target"})
    m = current(ds)
    check("moves a column into a field", m.get("target") == "stock_on_hand", str(m.get("target")))
    check(
        "the column leaves its old field — no column feeds two fields",
        m.get("inventory") != "stock_on_hand",
        str(m.get("inventory")),
    )
    check("the displaced column is unmapped, not left dangling", "units_sold" not in m.values())

    ds = fresh()
    svc.confirm_mapping(ds, {"unit_price": "ignore"})
    m = current(ds)
    check("'ignore' removes a column from the mapping", "unit_price" not in m.values(), str(m))
    check("'ignore' leaves other fields alone", m.get("target") == "units_sold")

    ds = fresh()
    svc.confirm_mapping(ds, {"product_group": "category", "branch_id": "location_id"})
    m = current(ds)
    check(
        "several overrides at once",
        m.get("category") == "product_group" and m.get("location_id") == "branch_id",
    )

    print("\nINTERNAL DIRECTION  { canonical: source_column }\n")

    ds = fresh()
    svc.confirm_mapping(ds, {"target": "stock_on_hand"})
    check("still accepted, for MCP and internal callers", current(ds).get("target") == "stock_on_hand")

    print("\nAMBIGUOUS NAMES\n")

    # A column literally called `price`, which is also a canonical field.
    frame = pl.read_csv(DEMO).rename({"unit_price": "price", "units_sold": "qty"})
    ds = fresh(frame, "amb.csv")
    svc.confirm_mapping(ds, {"target": "price"})
    check(
        "{target: price} resolves as internal, because 'target' is not a column",
        current(ds).get("target") == "price",
        str(current(ds).get("target")),
    )

    ds = fresh(frame, "amb2.csv")
    svc.confirm_mapping(ds, {"price": "target"})
    check(
        "{price: target} resolves as contract, because 'price' is a column",
        current(ds).get("target") == "price",
    )

    print("\nREJECTS NONSENSE\n")

    ds = fresh()
    raised = False
    try:
        svc.confirm_mapping(ds, {"no_such_column": "target"})
    except ValueError:
        raised = True
    check("an unknown column is refused, not silently ignored", raised)

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
