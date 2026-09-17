"""Service level derivation tests.

    py -3.11 scripts/test_economics.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402

from app.canonical import BusinessParams  # noqa: E402
from app.decision import economics  # noqa: E402
from app.decision.reorder import recommend  # noqa: E402

ALL = ["lead_time_days", "moq", "service_level", "unit_cost", "unit_margin",
       "holding_cost_rate", "bom_factor", "cost_short", "cost_over"]

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


def assumed_except(*given: str) -> list[str]:
    return [f for f in ALL if f not in given]


def main() -> None:
    print("RESOLUTION ORDER\n")

    d = economics.decide(BusinessParams(), assumed_except())
    check("nothing supplied -> 95% default, flagged", d.source == "default" and d.level == 0.95)

    d = economics.decide(BusinessParams(service_level=0.80), assumed_except("service_level"))
    check("explicit service level wins", d.source == "explicit" and abs(d.level - 0.80) < 1e-9)

    # Explicit must beat costs even when both are present.
    d = economics.decide(
        BusinessParams(service_level=0.70, cost_short=100, cost_over=1),
        assumed_except("service_level", "cost_short", "cost_over"),
    )
    check("explicit beats costs when both supplied", d.source == "explicit" and abs(d.level - 0.70) < 1e-9)

    print("\nCRITICAL RATIO\n")

    # Fresh greens: missing a sale loses 500, a leftover rots for 8,000.
    d = economics.decide(
        BusinessParams(cost_short=500, cost_over=8000),
        assumed_except("cost_short", "cost_over"),
    )
    check(
        f"perishable -> lean ({d.level:.1%})",
        d.source == "costs" and abs(d.level - 500 / 8500) < 1e-9,
    )

    # Infant formula: a stockout loses the customer, a leftover keeps a year.
    d = economics.decide(
        BusinessParams(cost_short=25000, cost_over=300),
        assumed_except("cost_short", "cost_over"),
    )
    check(f"high-margin durable -> deep ({d.level:.1%})", d.level > 0.98)

    d = economics.decide(
        BusinessParams(cost_short=1000, cost_over=1000),
        assumed_except("cost_short", "cost_over"),
    )
    check("equal costs -> 50%", abs(d.level - 0.5) < 1e-9)

    d = economics.decide(
        BusinessParams(unit_margin=12000, unit_cost=50000, holding_cost_rate=0.02),
        assumed_except("unit_margin", "unit_cost", "holding_cost_rate"),
    )
    check(f"margin fallback derives a level ({d.level:.1%})", d.source == "margin")

    print("\nZ-SCORE — the bug this replaced\n")

    # The old table snapped anything under 50% up to z=0. A 6% ratio must go
    # properly negative, or perishables are silently stocked as if both
    # mistakes cost the same.
    z = economics.z_score(500 / 8500)
    check(f"6% ratio gives negative z ({z:+.3f})", z < -1.4)
    check("50% gives z = 0", abs(economics.z_score(0.5)) < 1e-9)
    check("95% gives z ~ 1.645", abs(economics.z_score(0.95) - 1.6449) < 1e-3)
    check("extremes clamp rather than raise", np.isfinite(economics.z_score(0.0)) and np.isfinite(economics.z_score(1.0)))

    print("\nEND TO END\n")

    forecast = np.full(30, 10.0)

    lean = recommend(
        "GREENS", forecast,
        BusinessParams(lead_time_days=7, cost_short=500, cost_over=8000),
        current_inventory=0, error_std=4.0,
        assumed=assumed_except("lead_time_days", "cost_short", "cost_over"),
    )
    deep = recommend(
        "FORMULA", forecast,
        BusinessParams(lead_time_days=7, cost_short=25000, cost_over=300),
        current_inventory=0, error_std=4.0,
        assumed=assumed_except("lead_time_days", "cost_short", "cost_over"),
    )
    check(
        f"perishable orders under expected demand ({lean.recommended_qty:.0f} < 70)",
        lean.recommended_qty < 70,
    )
    check(
        f"durable orders over expected demand ({deep.recommended_qty:.0f} > 70)",
        deep.recommended_qty > 70,
    )
    check("perishable safety line is a negative trim", lean.safety_stock < 0)
    check(
        "trim is labelled as a trim, not a buffer",
        "Lean trim" in lean.explanation[1]["label"],
        lean.explanation[1]["label"],
    )
    check(
        "explanation still sums to the order",
        abs(sum(line["value"] for line in lean.explanation) - lean.recommended_qty) < 0.2,
    )
    check("service level provenance is attached", lean.service_level["source"] == "costs")

    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
