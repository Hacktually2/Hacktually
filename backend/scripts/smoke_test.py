"""End-to-end smoke test. Run this after any refactor.

    py -3.11 scripts/smoke_test.py

Exercises the whole pipeline on all three demo schemas without starting the API:
ingest -> map -> clean -> health -> segment -> backtest -> forecast -> decide
-> value simulation.

The point is to know instantly when something upstream broke, rather than
finding out during a demo.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.canonical import TARGET, TIMESTAMP  # noqa: E402
from app.db import database as db  # noqa: E402
from app.services import pipeline_service as svc  # noqa: E402

DEMO_DIR = Path(__file__).resolve().parents[2] / "data" / "demo"
HORIZON = 30

EXPECTED_TARGET = {
    "manufaktur_simplidots.csv": "qty_out",
    "distributor_generic.csv": "units_sold",
    "retail_messy.csv": "Quantity Out",
}

passed = 0
failed = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def run_file(path: Path) -> None:
    print(f"\n{'=' * 70}\n{path.name}\n{'=' * 70}")
    started = time.time()

    result = svc.ingest(path.name, path.read_bytes())
    dataset_id = result["dataset_id"]
    print(f"  dataset {dataset_id}  {result['rows']:,} rows")
    if result["preset_matched"]:
        print(f"  preset matched: {result['preset_matched']}")

    mapping = {f["canonical"]: f for f in result["mapping"]["fields"]}
    target = mapping.get(TARGET, {}).get("source_column")
    timestamp = mapping.get(TIMESTAMP, {}).get("source_column")
    print(f"  timestamp -> {timestamp}")
    print(f"  target    -> {target}")

    check(
        f"target column is {EXPECTED_TARGET[path.name]!r}",
        target == EXPECTED_TARGET[path.name],
        f"got {target!r}",
    )
    check("timestamp detected", timestamp is not None)
    # The trap: revenue must never be chosen as demand.
    check("did not pick a revenue column as demand", target != "Total Penjualan")

    svc.confirm_mapping(dataset_id, {})
    health = svc.prepare(dataset_id)
    print(
        f"  health {health['health_score']}/100 · {health['frequency']} · "
        f"{health['series_forecastable']}/{health['series_total']} forecastable"
    )
    check("health score is sane", 0 <= health["health_score"] <= 100)
    check("found forecastable series", health["series_forecastable"] > 0)
    check("detected daily frequency", health["frequency"] == "daily")

    portfolio = health.get("demand_portfolio", {})
    print("  demand mix: " + ", ".join(f"{k} {v:.0%}" for k, v in portfolio.items() if v))
    check("demand classes are populated", sum(portfolio.values()) > 0.99)

    print("  forecasting...")
    forecast = svc.run_forecast(dataset_id, horizon=HORIZON)
    print(f"  {forecast['series_forecast']} series forecast")
    print("  model mix: " + ", ".join(f"{k} {v:.0%}" for k, v in forecast["model_mix"].items()))
    check("every forecastable series got a model", forecast["series_forecast"] > 0)
    check("model mix is populated", len(forecast["model_mix"]) > 0)

    recommendations = svc.get_recommendations(dataset_id, limit=5)
    check("recommendations produced", len(recommendations) > 0)
    if recommendations:
        top = recommendations[0]
        print(
            f"  top action: {top['series_id']} — order {top['recommended_qty']:,.0f} "
            f"({top['stockout_risk']} risk)"
        )
        explanation_total = sum(line["value"] for line in top["explanation"])
        check(
            "explanation arithmetic matches the recommendation",
            abs(explanation_total - top["recommended_qty"]) < 1.0,
            f"lines sum to {explanation_total:.1f}, recommended {top['recommended_qty']:.1f}",
        )

    value = svc.get_value_simulation(dataset_id)
    if value:
        delta = value["delta"]
        print(
            f"  value: fill rate {delta['fill_rate_points']:+.1f} pts, "
            f"Rp {delta['total_benefit']:,.0f} benefit over {value['scope']['series']} series"
        )
        check("value simulation ran", "baseline" in value and "proposed" in value)
    else:
        check("value simulation ran", False, "no result stored")

    usage = svc.get_usage(dataset_id)
    print(f"  metered: {usage['forecast_points']:,} forecast points")
    check("usage metered", usage["forecast_points"] > 0)

    print(f"  took {time.time() - started:.1f}s")


def main() -> None:
    if not DEMO_DIR.exists():
        print("No demo data. Run: py -3.11 scripts/make_demo_data.py")
        sys.exit(1)

    db.init()
    for name in EXPECTED_TARGET:
        path = DEMO_DIR / name
        if path.exists():
            run_file(path)
        else:
            check(f"{name} exists", False)

    print(f"\n{'=' * 70}")
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
