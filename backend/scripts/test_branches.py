"""Branch insights, transfers, reconciliation and digest — tested on invariants.

A transfer that looks plausible can still be wrong in a way that costs money:
moving stock a branch is about to sell, or shipping more than the receiving
branch needs. These checks target those failure modes rather than response codes.

    py -3.11 scripts/test_branches.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import polars as pl  # noqa: E402

from app.canonical import SERIES_ID, TARGET  # noqa: E402
from app.db import database as db  # noqa: E402
from app.integrations import notify  # noqa: E402
from app.services import branches, pipeline_service as svc, view_models as views  # noqa: E402

passed = 0
failed = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}")
        if detail:
            print(f"        {detail}")


def forecasted_multibranch() -> str:
    row = db.query_one(
        """SELECT d.dataset_id FROM datasets d
           WHERE d.dataset_id IN (SELECT DISTINCT dataset_id FROM forecasts)
             AND (SELECT COUNT(DISTINCT location_id) FROM series_profiles s
                  WHERE s.dataset_id = d.dataset_id) > 1
           ORDER BY d.created_at DESC LIMIT 1"""
    )
    if not row:
        print("No forecasted multi-branch dataset. Run smoke_test.py first.")
        sys.exit(1)
    return row["dataset_id"]


def test_dedupe() -> None:
    print("OVERLAPPING UPLOADS\n")
    big = pl.read_csv(Path(__file__).resolve().parents[2] / "data/demo/distributor_generic.csv")
    ds = svc.ingest("owner.csv", big.write_csv().encode())["dataset_id"]
    svc.confirm_mapping(ds)
    before, _, _, _ = svc._load_canonical(ds)
    base = before.filter(pl.col(SERIES_ID).str.ends_with("__JKT01"))[TARGET].sum()

    slice_ = big.filter(pl.col("branch_id") == "JKT01").sort("invoice_date").tail(300)

    svc.append_source(ds, "same.csv", slice_.write_csv().encode(), "JKT01")
    svc.confirm_mapping(ds)
    same, _, _, report = svc._load_canonical(ds)
    total = same.filter(pl.col(SERIES_ID).str.ends_with("__JKT01"))[TARGET].sum()
    check(
        "re-uploading the same period does not add demand",
        abs(total - base) < 1e-6,
        f"base {base:,.0f}, after {total:,.0f}",
    )
    check("superseded rows are counted", report.superseded_rows > 0, str(report.superseded_rows))

    corrected = slice_.with_columns((pl.col("units_sold") * 2).alias("units_sold"))
    svc.append_source(ds, "fix.csv", corrected.write_csv().encode(), "JKT01")
    svc.confirm_mapping(ds)
    fixed, _, _, _ = svc._load_canonical(ds)
    total = fixed.filter(pl.col(SERIES_ID).str.ends_with("__JKT01"))[TARGET].sum()
    expected = base + slice_["units_sold"].sum()
    check(
        "a correction replaces the old figures instead of adding to them",
        abs(total - expected) < 1e-6,
        f"expected {expected:,.0f}, got {total:,.0f}",
    )

    other_before = before.filter(pl.col(SERIES_ID).str.ends_with("__SBY01"))[TARGET].sum()
    other_after = fixed.filter(pl.col(SERIES_ID).str.ends_with("__SBY01"))[TARGET].sum()
    check(
        "a branch upload leaves other branches untouched",
        abs(other_before - other_after) < 1e-6,
    )


def test_insights(ds: str) -> None:
    print("\nINSIGHTS\n")
    rows = views._enriched_rows(ds)
    data = branches.insights(ds)
    b = data["branches"]

    check(
        "branch series counts sum to all rows",
        sum(x["series_count"] for x in b) == len(rows),
        f"{sum(x['series_count'] for x in b)} vs {len(rows)}",
    )
    check(
        "branch order units sum to the network total",
        abs(sum(x["units_to_order"] for x in b) - sum(r["recommended_qty"] for r in rows)) < 1,
    )
    bad_rate = [
        x["location_id"] for x in b
        if abs(x["attention_rate_percent"] - round(x["attention_count"] / x["series_count"] * 100, 1)) > 0.1
    ]
    check("attention rate is attention / series, per branch", not bad_rate, str(bad_rate))
    check(
        "demand shares sum to 100",
        abs(sum(x["demand_share_percent"] for x in b) - 100) <= 0.5,
    )

    one = branches.insights(ds, b[0]["location_id"])
    check(
        "location scope returns only that branch",
        [x["location_id"] for x in one["branches"]] == [b[0]["location_id"]],
    )
    check(
        "scoped transfers all touch that branch",
        all(b[0]["location_id"] in (t["from_location"], t["to_location"]) for t in one["transfers"]),
    )


def test_transfers(ds: str) -> None:
    print("\nTRANSFERS\n")
    rows = views._enriched_rows(ds)
    plan = branches.transfer_plan(rows)
    by_key = {(r["item_id"], r["location_id"]): r for r in rows}
    print(f"        {len(plan)} candidate transfers")

    check("never moves stock to the same branch", all(t["from_location"] != t["to_location"] for t in plan))
    check("every transfer moves a positive amount", all(t["units"] > 0 for t in plan))

    bad_source = []
    shipped_out: dict[tuple, float] = {}
    shipped_in: dict[tuple, float] = {}
    for t in plan:
        src = by_key[(t["item_id"], t["from_location"])]
        dst = by_key[(t["item_id"], t["to_location"])]
        if src["recommended_qty"] > 0:
            bad_source.append(f"{t['item_id']}@{t['from_location']} is itself short")
        shipped_out[(t["item_id"], t["from_location"])] = shipped_out.get((t["item_id"], t["from_location"]), 0) + t["units"]
        shipped_in[(t["item_id"], t["to_location"])] = shipped_in.get((t["item_id"], t["to_location"]), 0) + t["units"]

    check("never takes stock from a branch that is short itself", not bad_source, "; ".join(bad_source[:3]))

    over_ship = []
    for (item, loc), units in shipped_out.items():
        r = by_key[(item, loc)]
        spare = r["current_stock"] - (r["lead_time_demand"] + max(r["safety_stock"], 0))
        if units > spare + 0.5:
            over_ship.append(f"{item}@{loc} ships {units:.0f}, spare {spare:.0f}")
    check("never ships more than a branch's spare stock", not over_ship, "; ".join(over_ship[:3]))

    over_fill = []
    for (item, loc), units in shipped_in.items():
        need = by_key[(item, loc)]["recommended_qty"]
        if units > need + 0.5:
            over_fill.append(f"{item}@{loc} receives {units:.0f}, needs {need:.0f}")
    check("never sends more than the receiving branch needs", not over_fill, "; ".join(over_fill[:3]))

    check("every transfer carries the shipping caveat", all(t.get("caveat") for t in plan))


def test_reconcile(ds: str) -> None:
    print("\nRECONCILE\n")
    codes = [b["location_id"] for b in branches.list_branches(ds)]
    first = codes[0]
    messy = first.lower().replace("0", "-0", 1) if "0" in first else f" {first.lower()} "
    result = branches.reconcile(ds, [first, messy, "XYZ99"])

    check("exact code matches exactly", any(m["supplied"] == first for m in result["exact"]))
    check(
        "a formatting variant is held for confirmation, not auto-granted",
        any(m["supplied"] == messy for m in result["needs_confirmation"]),
        str(result["needs_confirmation"]),
    )
    check("an unknown code is reported", any(m["supplied"] == "XYZ99" for m in result["not_in_data"]))
    check(
        "branches in the data but not listed are surfaced",
        set(result["in_data_but_not_listed"]) == set(codes) - {first},
    )


def test_digest(ds: str) -> None:
    print("\nDIGEST\n")
    notify.init()
    data = branches.insights(ds)
    target = max(data["branches"], key=lambda b: b["attention_count"])["location_id"]
    notify.reset(ds, target)

    preview = notify.send_branch_digest(ds, target, ["mgr@example.com"], dry_run=True)
    check("dry run builds a message without sending", not preview["sent"] and preview["body"])
    check("digest is written in Indonesian", "perlu" in preview["body"] or "barang" in preview["body"])
    check("dry run reports new items", preview["new_items"] > 0, str(preview.get("new_items")))

    # Simulate a successful send, then confirm repeats are suppressed.
    rows = [
        r for r in views._enriched_rows(ds)
        if r["location_id"] == target and r["risk"] in views.ATTENTION
    ]
    notify.record_sent(ds, target, rows)
    fresh, repeat = notify.filter_new(ds, target, rows)
    check("already-reported items are not sent again", not fresh and len(repeat) == len(rows))

    if rows:
        worse = dict(rows[0])
        notify.record_sent(ds, target, [dict(worse, risk="at_risk")])
        worse["risk"] = "critical"
        fresh, _ = notify.filter_new(ds, target, [worse])
        check("an item whose risk worsened is sent again", len(fresh) == 1)

    # Put the log back to every item at its true risk, so nothing is new.
    notify.reset(ds, target)
    notify.record_sent(ds, target, rows)
    empty = notify.send_branch_digest(ds, target, ["mgr@example.com"])
    inbound = [t for t in branches.insights(ds, target)["transfers"] if t["to_location"] == target]
    if inbound:
        # A transfer is actionable on its own, so the digest still goes — but it
        # must not re-list items the manager has already seen.
        check(
            "with a pending transfer, digest sends but repeats nothing",
            not empty.get("skipped") and empty.get("new_items") == 0,
            f"skipped={empty.get('skipped')} new_items={empty.get('new_items')}",
        )
    else:
        check(
            "nothing new and no transfer means no message at all",
            empty.get("skipped") is True,
            str(empty.get("reason")),
        )

    no_recipient = notify.send_branch_digest(ds, target, [], dry_run=False)
    check(
        "no recipients means nothing is sent",
        not no_recipient.get("sent"),
    )
    notify.reset(ds, target)


def main() -> None:
    db.init()
    test_dedupe()
    ds = forecasted_multibranch()
    print(f"\n(using {ds})")
    test_insights(ds)
    test_transfers(ds)
    test_reconcile(ds)
    test_digest(ds)
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
