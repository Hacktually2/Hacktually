"""Hierarchical aggregation — branch level up to network level.

Bottom-up only, deliberately. We forecast at SKU-branch because that is the
level a reorder decision is made at, and summing those forecasts gives a network
total that is **coherent by construction**: the branch numbers and the national
number can never contradict each other.

That coherence is the whole point commercially. A procurement lead who sees the
branch forecasts add up to something different from the national forecast stops
trusting both numbers, and the tool goes back in the drawer.

MinT and other optimal-reconciliation methods can beat bottom-up on accuracy at
the top level, but they are invisible in a demo and they cost real time. Not now.

One honest limitation to state if asked: bottom-up inherits the noise of the
bottom level, so a network total built this way is usually less accurate than
forecasting the network directly. We accept that because the branch numbers are
the ones people act on, and an incoherent pair of numbers is worse than a
slightly noisier total.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np

from ..canonical import split_series_id


def build(
    forecasts: dict[str, np.ndarray],
    recommendations: dict[str, dict] | None = None,
) -> dict:
    """Roll SKU-branch forecasts up to item level, branch level and network total."""
    recommendations = recommendations or {}

    by_item: dict[str, np.ndarray] = defaultdict(lambda: None)
    by_branch: dict[str, np.ndarray] = defaultdict(lambda: None)
    network: np.ndarray | None = None

    branch_reorder: dict[str, float] = defaultdict(float)
    branch_at_risk: dict[str, int] = defaultdict(int)
    branch_series: dict[str, int] = defaultdict(int)

    for series_id, point in forecasts.items():
        item_id, location_id = split_series_id(series_id)
        location_id = location_id or "ALL"
        values = np.asarray(point, dtype=float)

        by_item[item_id] = values if by_item[item_id] is None else by_item[item_id] + values
        by_branch[location_id] = (
            values if by_branch[location_id] is None else by_branch[location_id] + values
        )
        network = values if network is None else network + values

        branch_series[location_id] += 1
        rec = recommendations.get(series_id)
        if rec:
            branch_reorder[location_id] += float(rec.get("recommended_qty") or 0.0)
            if rec.get("stockout_risk") == "high":
                branch_at_risk[location_id] += 1

    return {
        "levels": ["network", "branch", "item", "sku_branch"],
        "network": {
            "horizon_total": float(network.sum()) if network is not None else 0.0,
            "per_period": [round(float(v), 1) for v in (network if network is not None else [])],
            "series": len(forecasts),
        },
        "branches": sorted(
            (
                {
                    "location_id": location,
                    "horizon_total": round(float(values.sum()), 1),
                    "series": branch_series[location],
                    "recommended_qty": round(branch_reorder[location], 1),
                    "series_at_risk": branch_at_risk[location],
                }
                for location, values in by_branch.items()
            ),
            key=lambda row: -row["horizon_total"],
        ),
        "items": sorted(
            (
                {"item_id": item, "horizon_total": round(float(values.sum()), 1)}
                for item, values in by_item.items()
            ),
            key=lambda row: -row["horizon_total"],
        )[:100],
        "coherent": True,
        "method": "bottom-up",
    }


def coherence_check(network_total: float, branch_totals: list[float]) -> dict:
    """Prove the levels agree. Cheap, and it is the claim people actually doubt."""
    summed = float(sum(branch_totals))
    gap = abs(summed - network_total)
    return {
        "network_total": round(network_total, 1),
        "sum_of_branches": round(summed, 1),
        "gap": round(gap, 6),
        "coherent": gap < max(1.0, abs(network_total) * 1e-6),
    }
