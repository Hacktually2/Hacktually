"""Contract test for the frontend integration spec, section 9.

These invariants span responses, so nothing catches them except agreement
between endpoints. Overview saying 5 while Supply Chain lists 7 does not break
either screen — it just makes both untrustworthy, which is worse.

    py -3.11 scripts/check_contract.py [dataset_id]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.db import database as db  # noqa: E402
from app.main import app  # noqa: E402

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


def main() -> None:
    db.init()
    dataset_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not dataset_id:
        row = db.query_one(
            """SELECT dataset_id FROM datasets
               WHERE dataset_id IN (SELECT DISTINCT dataset_id FROM forecasts)
               ORDER BY created_at DESC LIMIT 1"""
        )
        if not row:
            print("No dataset with forecasts. Run smoke_test.py first.")
            sys.exit(1)
        dataset_id = row["dataset_id"]

    print(f"Contract check on {dataset_id}\n")

    with TestClient(app) as client:
        overview = client.get(f"/api/v1/overview/{dataset_id}").json()
        supply = client.get(f"/api/v1/recommendations/{dataset_id}").json()
        attention = client.get(
            f"/api/v1/recommendations/{dataset_id}?risk=attention"
        ).json()
        health = client.get(f"/api/v1/datasets/{dataset_id}/health").json()
        demand = client.get(f"/api/v1/demand/{dataset_id}").json()

    rows = supply["rows"]
    by_risk: dict[str, int] = {}
    for row in rows:
        by_risk[row["risk"]] = by_risk.get(row["risk"], 0) + 1

    # 1. Overview stockout KPI equals critical + at_risk rows
    kpi = next(k for k in overview["kpis"] if k["key"] == "needs_attention")
    want = by_risk.get("critical", 0) + by_risk.get("at_risk", 0)
    check(
        "Overview attention KPI matches critical + at_risk rows",
        kpi["value"] == want,
        f"KPI says {kpi['value']}, rows give {want}",
    )

    # 1b. ?risk=attention returns exactly those rows
    check(
        "risk=attention returns the same set",
        len(attention["rows"]) == want,
        f"filter returned {len(attention['rows'])}, expected {want}",
    )

    # 2. Inventory bands match the rows per risk
    band_mismatch = [
        b for b in overview["inventory"]["bands"]
        if b["series_count"] != by_risk.get(b["risk"], 0)
    ]
    check(
        "inventory.bands counts match rows per risk",
        not band_mismatch,
        f"mismatched: {band_mismatch}",
    )

    # 3. Every priority action exists in the rows
    row_ids = {r["series_id"] for r in rows}
    missing = [
        a["series_id"] for a in overview["priority_actions"]
        if a["series_id"] not in row_ids
    ]
    check("every priority action exists in rows", not missing, f"missing: {missing[:3]}")

    # 4. A priority action's risk and metric match its row
    by_id = {r["series_id"]: r for r in rows}
    bad = []
    for action in overview["priority_actions"]:
        row = by_id.get(action["series_id"])
        if not row:
            continue
        if action["risk"] != row["risk"]:
            bad.append(f"{action['series_id']} risk {action['risk']} vs {row['risk']}")
        expected = (
            row["days_until_stockout"]
            if row["days_until_stockout"] is not None
            else row["coverage_days"]
        )
        if action["metric_value"] != expected:
            bad.append(f"{action['series_id']} metric {action['metric_value']} vs {expected}")
    check("priority action risk and metric match the row", not bad, "; ".join(bad[:3]))

    # 5. series_excluded length equals total - forecastable
    gap = health["series_total"] - health["series_forecastable"]
    check(
        "series_excluded length equals total - forecastable",
        len(health["series_excluded"]) == gap,
        f"listed {len(health['series_excluded'])}, expected {gap}",
    )

    # 6. Explanation lines sum to recommended_qty
    bad_sums = []
    for row in rows:
        lines = row["explanation"]["lines"]
        total = round(sum(line["value"] for line in lines), 1)
        if abs(total - row["recommended_qty"]) > 0.15:
            bad_sums.append(f"{row['series_id']}: {total} vs {row['recommended_qty']}")
    check(
        f"explanation lines sum to recommended_qty ({len(rows)} rows)",
        not bad_sums,
        "; ".join(bad_sums[:3]),
    )

    # 6b. Subtractions carry a negative value
    bad_signs = [
        f"{r['series_id']}:{line['label']}"
        for r in rows
        for line in r["explanation"]["lines"]
        if line["kind"] == "subtract" and line["value"] > 0
    ]
    check("subtraction lines are negative", not bad_signs, "; ".join(bad_signs[:3]))

    # 7. Demand class counts sum to total, shares to 100
    pattern = demand["pattern"]
    summed = sum(c["series_count"] for c in pattern["classes"])
    shares = round(sum(c["share_percent"] for c in pattern["classes"]), 1)
    check(
        "demand class counts sum to total_series",
        summed == pattern["total_series"],
        f"{summed} vs {pattern['total_series']}",
    )
    check("demand class shares sum to 100", abs(shares - 100.0) <= 0.5, f"got {shares}")

    # 8. lower <= forecast <= upper on every forecast point
    for name, chart in (("overview", overview["demand_chart"]), ("demand", demand["chart"])):
        bad_band = [
            p["t"] for p in chart["points"]
            if p["forecast"] is not None
            and not (p["lower"] <= p["forecast"] <= p["upper"])
        ]
        check(f"{name} chart: lower <= forecast <= upper", not bad_band, f"{bad_band[:3]}")

        # 9. cutoff_index lands on the last observed point
        idx = chart["cutoff_index"]
        points = chart["points"]
        ok = (
            0 <= idx < len(points)
            and points[idx]["actual"] is not None
            and (idx + 1 >= len(points) or points[idx + 1]["actual"] is None)
        )
        check(f"{name} chart: cutoff_index on last observed point", ok, f"index {idx}")

        # 10. The join is stitched, so the two lines meet
        if 0 <= idx < len(points):
            join = points[idx]
            check(
                f"{name} chart: join point carries forecast == actual",
                join["forecast"] == join["actual"],
                f"actual {join['actual']}, forecast {join['forecast']}",
            )

    # 11. recommended_qty is a whole multiple of moq when above zero
    bad_moq = [
        f"{r['series_id']}: {r['recommended_qty']} not a multiple of {r['moq']}"
        for r in rows
        if r["moq"] > 0 and r["recommended_qty"] > 0
        and abs(r["recommended_qty"] % r["moq"]) > 0.15
    ]
    check("recommended_qty is a multiple of moq", not bad_moq, "; ".join(bad_moq[:3]))

    # 12. summary counts match the rows for the same filter
    summary_mismatch = [
        f"{s['risk']}: {s['series_count']} vs {by_risk.get(s['risk'], 0)}"
        for s in supply["summary"]
        if s["series_count"] != by_risk.get(s["risk"], 0)
    ]
    check("summary counts match rows", not summary_mismatch, "; ".join(summary_mismatch))

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
