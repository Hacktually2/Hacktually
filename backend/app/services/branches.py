"""Branch view: how each branch is doing, and what moves between them.

Everything here is derived from the same enriched rows the Supply Chain screen
reads, so a branch's numbers cannot disagree with the rows a manager drills into.

Three rules shape it.

**Rates, not counts.** A branch with 33 SKUs has more items at risk than one with
27 simply because it carries more. Ranking on raw counts tells the biggest branch
it is the worst, which is wrong and demoralising. Every comparison is a share of
that branch's own series, shown beside the network average.

**Operational, not profitability.** "Least profitable branch" needs revenue minus
cost, and branch operating cost — rent, staff, utilities — is never in a sales
export. Inventing it would be the one thing this system refuses to do. What can be
measured honestly is also what a branch manager can act on: stockout exposure,
dormant stock, demand direction, how forecastable their data is.

**Transfers before purchases.** A surplus in one branch and a shortage of the same
item in another is a purchase that does not need to happen. That signal only
exists when every branch is seen at once, which is why branches are scopes over
one dataset rather than separate datasets.
"""

from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict

import polars as pl

from ..canonical import SERIES_ID, TARGET, TIMESTAMP
from ..db import database as db
from . import pipeline_service as svc
from . import view_models as views

# A transfer smaller than this is noise, not a decision worth a phone call.
MIN_TRANSFER_UNITS = 1.0
MIN_TRANSFER_SHARE_OF_NEED = 0.10


# ------------------------------------------------------------------ insights

def insights(dataset_id: str, location: str | None = None) -> dict:
    views._dataset_row(dataset_id)
    rows = views._enriched_rows(dataset_id)
    if not rows:
        return {
            "dataset_id": dataset_id,
            "branches": [],
            "network": None,
            "transfers": [],
            "note": "No recommendations yet — run a forecast first.",
        }

    by_branch: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_branch[row["location_id"] or "ALL"].append(row)

    trend = _trend_by_branch(dataset_id, views._horizon_days(dataset_id))
    wape = _wape_by_branch(dataset_id)
    dormant = _dormant_by_branch(dataset_id)
    transfers = transfer_plan(rows)

    transfer_in: dict[str, float] = defaultdict(float)
    transfer_out: dict[str, float] = defaultdict(float)
    for t in transfers:
        transfer_in[t["to_location"]] += t["units"]
        transfer_out[t["from_location"]] += t["units"]

    network_total = sum(r["forecast_demand"] for r in rows) or 1.0
    branches = []
    for code, group in sorted(by_branch.items()):
        n = len(group)
        attention = [r for r in group if r["risk"] in views.ATTENTION]
        demand = sum(r["forecast_demand"] for r in group)
        units = sum(r["recommended_qty"] for r in group)
        dormant_info = dormant.get(code, {"series": 0, "units": 0.0})
        branch_wape = wape.get(code)

        branches.append({
            "location_id": code,
            "series_count": n,
            # Rates are the comparable figures. Counts are kept for display only.
            "attention_count": len(attention),
            "attention_rate_percent": round(len(attention) / n * 100, 1) if n else 0.0,
            "units_to_order": round(units, 1),
            "units_coverable_by_transfer": round(transfer_in.get(code, 0.0), 1),
            "units_available_to_transfer": round(transfer_out.get(code, 0.0), 1),
            "demand_forecast": round(demand, 1),
            "demand_share_percent": round(demand / network_total * 100, 1),
            "demand_trend_percent": trend.get(code),
            "dormant_series": dormant_info["series"],
            "dormant_rate_percent": (
                round(dormant_info["series"] / (n + dormant_info["series"]) * 100, 1)
                if (n + dormant_info["series"]) else 0.0
            ),
            "dormant_units_held": round(dormant_info["units"], 1),
            "median_wape_percent": round(branch_wape * 100, 1) if branch_wape is not None else None,
        })

    network = _network_averages(branches)
    for branch in branches:
        branch["flags"] = _flags(branch, network)

    if location:
        branches = [b for b in branches if b["location_id"] == location]
        transfers = [
            t for t in transfers
            if t["to_location"] == location or t["from_location"] == location
        ]

    return {
        "dataset_id": dataset_id,
        "branches": branches,
        "network": network,
        "transfers": transfers,
        "note": (
            "Comparisons use rates within each branch, not raw counts, so a larger "
            "branch is not ranked worse for carrying more items. Branch operating "
            "cost is not in the data, so profitability is not estimated."
        ),
    }


def _network_averages(branches: list[dict]) -> dict:
    """Averages across branches, weighted by series, for 'vs network' context."""
    total_series = sum(b["series_count"] for b in branches) or 1
    trends = [b["demand_trend_percent"] for b in branches if b["demand_trend_percent"] is not None]
    wapes = [b["median_wape_percent"] for b in branches if b["median_wape_percent"] is not None]
    return {
        "branches": len(branches),
        "series": total_series,
        "attention_rate_percent": round(
            sum(b["attention_count"] for b in branches) / total_series * 100, 1
        ),
        "dormant_rate_percent": round(
            statistics.mean(b["dormant_rate_percent"] for b in branches), 1
        ) if branches else 0.0,
        "demand_trend_percent": round(statistics.mean(trends), 1) if trends else None,
        "median_wape_percent": round(statistics.median(wapes), 1) if wapes else None,
    }


def _flags(branch: dict, network: dict) -> list[dict]:
    """What stands out for this branch against the network. Rates only."""
    flags = []
    gap = branch["attention_rate_percent"] - network["attention_rate_percent"]
    if gap >= 15:
        flags.append({
            "key": "attention_above_network",
            "severity": "warning",
            "text": (
                f"{branch['attention_rate_percent']:.0f}% of items need attention, "
                f"against {network['attention_rate_percent']:.0f}% across the network"
            ),
        })
    if branch["dormant_rate_percent"] - network["dormant_rate_percent"] >= 10:
        flags.append({
            "key": "dormant_above_network",
            "severity": "warning",
            "text": (
                f"{branch['dormant_series']} dormant items still listed "
                f"({branch['dormant_rate_percent']:.0f}% vs "
                f"{network['dormant_rate_percent']:.0f}% network)"
            ),
        })
    trend = branch["demand_trend_percent"]
    net_trend = network["demand_trend_percent"]
    if trend is not None and net_trend is not None and trend - net_trend <= -10:
        flags.append({
            "key": "demand_falling_vs_network",
            "severity": "info",
            "text": f"Demand {trend:+.0f}% while the network is {net_trend:+.0f}%",
        })
    if branch["units_coverable_by_transfer"] > 0:
        flags.append({
            "key": "transfer_available",
            "severity": "info",
            "text": (
                f"{branch['units_coverable_by_transfer']:,.0f} units can come from "
                "another branch instead of a new purchase"
            ),
        })
    return flags


def _trend_by_branch(dataset_id: str, horizon: int) -> dict[str, float | None]:
    """Forecast horizon against the same length of history just before it."""
    from datetime import timedelta

    canonical, _, _, _ = svc._load_canonical(dataset_id)
    end = canonical.get_column(TIMESTAMP).max()
    if end is None:
        return {}
    recent = (
        canonical.filter(pl.col(TIMESTAMP) > end - timedelta(days=horizon))
        .with_columns(pl.col(SERIES_ID).str.split("__").list.last().alias("loc"))
        .group_by("loc")
        .agg(pl.col(TARGET).sum().alias("past"))
    )
    future = {
        r["loc"]: float(r["f"] or 0)
        for r in db.query(
            """SELECT s.location_id loc, SUM(f.forecast) f
               FROM forecasts f JOIN series_profiles s
                 ON s.dataset_id = f.dataset_id AND s.series_id = f.series_id
               WHERE f.dataset_id = ? GROUP BY s.location_id""",
            (dataset_id,),
        )
    }
    out: dict[str, float | None] = {}
    for row in recent.iter_rows(named=True):
        past = float(row["past"] or 0)
        loc = row["loc"]
        out[loc] = round((future.get(loc, 0) - past) / past * 100, 1) if past > 0 else None
    return out


def _wape_by_branch(dataset_id: str) -> dict[str, float]:
    grouped: dict[str, list[float]] = defaultdict(list)
    for r in db.query(
        """SELECT s.location_id loc, m.wape w FROM model_selection m
           JOIN series_profiles s ON s.dataset_id = m.dataset_id AND s.series_id = m.series_id
           WHERE m.dataset_id = ? AND m.wape IS NOT NULL""",
        (dataset_id,),
    ):
        if r["w"] is not None and math.isfinite(r["w"]):
            grouped[r["loc"] or "ALL"].append(float(r["w"]))
    return {k: statistics.median(v) for k, v in grouped.items() if v}


def _dormant_by_branch(dataset_id: str) -> dict[str, dict]:
    """Series excluded as discontinued or dormant, and stock still held against them."""
    health = svc.get_health(dataset_id) or {}
    dead = (health.get("dead_stock") or {}).get("items", [])
    held = {item["series_id"]: float(item.get("units_held") or 0) for item in dead}

    out: dict[str, dict] = defaultdict(lambda: {"series": 0, "units": 0.0})
    for r in db.query(
        """SELECT series_id, location_id FROM series_profiles
           WHERE dataset_id = ? AND forecastable = 0""",
        (dataset_id,),
    ):
        loc = r["location_id"] or "ALL"
        out[loc]["series"] += 1
        out[loc]["units"] += held.get(r["series_id"], 0.0)
    return dict(out)


# ------------------------------------------------------------------ transfers

def transfer_plan(rows: list[dict]) -> list[dict]:
    """Move surplus to shortage for the same item before anyone buys more.

    A branch's surplus is stock above what it needs to cover its own lead time
    plus safety buffer — never stock it is about to sell. Shortages are served
    most-urgent first, from the largest surplus first, so a single transfer
    closes as much of a gap as possible.

    What is deliberately NOT computed: inter-branch shipping time and cost.
    Moving goods Jakarta to Medan is not free or instant, and neither figure is
    in the data. Each suggestion is therefore a candidate for a person to check,
    labelled as such, not an instruction.
    """
    by_item: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_item[row["item_id"]].append(row)

    plan: list[dict] = []
    for item_id, branches in by_item.items():
        if len(branches) < 2:
            continue

        surplus = []
        for r in branches:
            need = r["lead_time_demand"] + max(r["safety_stock"], 0.0)
            spare = r["current_stock"] - need
            if spare >= MIN_TRANSFER_UNITS and r["recommended_qty"] <= 0:
                surplus.append({"row": r, "spare": spare})

        shortage = [r for r in branches if r["recommended_qty"] > 0]
        if not surplus or not shortage:
            continue

        surplus.sort(key=lambda s: -s["spare"])
        shortage.sort(key=lambda r: (
            r["days_until_stockout"] if r["days_until_stockout"] is not None else 10**6,
            -r["recommended_qty"],
        ))

        for need_row in shortage:
            remaining = need_row["recommended_qty"]
            for source in surplus:
                if remaining <= 0:
                    break
                units = min(source["spare"], remaining)
                if units < MIN_TRANSFER_UNITS:
                    continue
                if units < need_row["recommended_qty"] * MIN_TRANSFER_SHARE_OF_NEED:
                    continue
                source["spare"] -= units
                remaining -= units
                plan.append({
                    "item_id": item_id,
                    "from_location": source["row"]["location_id"],
                    "to_location": need_row["location_id"],
                    "units": round(units, 1),
                    "to_days_until_stockout": need_row["days_until_stockout"],
                    "to_risk": need_row["risk"],
                    "purchase_avoided_units": round(units, 1),
                    "reason": (
                        f"{source['row']['location_id']} holds "
                        f"{source['row']['current_stock']:,.0f} against a need of "
                        f"{source['row']['lead_time_demand'] + max(source['row']['safety_stock'], 0):,.0f}; "
                        f"{need_row['location_id']} needs {need_row['recommended_qty']:,.0f}"
                    ),
                    "caveat": "Shipping time and cost between branches are not in the data — confirm before moving stock.",
                })

    plan.sort(key=lambda t: (
        t["to_days_until_stockout"] if t["to_days_until_stockout"] is not None else 10**6,
        -t["units"],
    ))
    return plan


# ------------------------------------------------------------------ summary

def branch_summary(dataset_id: str, location: str, limit: int = 5) -> dict:
    """What a branch manager should read today, in plain Indonesian.

    Only actionable lines. A message that says everything is fine trains people
    to stop reading, so an empty summary returns has_actions=False and the
    notifier sends nothing.
    """
    data = insights(dataset_id, location)
    branch = next((b for b in data["branches"] if b["location_id"] == location), None)
    if not branch:
        raise KeyError(location)

    rows = [
        r for r in views._enriched_rows(dataset_id)
        if r["location_id"] == location and r["risk"] in views.ATTENTION
    ]
    rows.sort(key=lambda r: (
        r["days_until_stockout"] if r["days_until_stockout"] is not None else 10**6,
        -r["recommended_qty"],
    ))

    inbound = [t for t in data["transfers"] if t["to_location"] == location]
    outbound = [t for t in data["transfers"] if t["from_location"] == location]

    lines: list[str] = []
    if rows:
        lines.append(f"{len(rows)} barang perlu dipesan:")
        for r in rows[:limit]:
            days = r["days_until_stockout"]
            if days is None:
                when = "stok menipis"
            elif days <= 0:
                when = "stok sudah habis"
            else:
                when = f"habis dalam {days} hari"
            lines.append(f"  {r['item_id']:<12} pesan {r['recommended_qty']:>8,.0f}   {when}")
        if len(rows) > limit:
            lines.append(f"  ...dan {len(rows) - limit} lainnya")

    for t in inbound[:3]:
        lines.append(
            f"{t['item_id']}: {t['units']:,.0f} unit bisa diambil dari "
            f"{t['from_location']}, tidak perlu beli."
        )
    for t in outbound[:3]:
        lines.append(
            f"{t['item_id']}: cabang {t['to_location']} butuh {t['units']:,.0f} unit "
            "dari kelebihan stok cabang ini."
        )

    if branch["dormant_series"]:
        lines.append(
            f"{branch['dormant_series']} barang tidak bergerak dan dikeluarkan dari ramalan."
        )

    has_actions = bool(rows or inbound or outbound)
    return {
        "dataset_id": dataset_id,
        "location_id": location,
        "has_actions": has_actions,
        "action_series": [r["series_id"] for r in rows],
        "text": "\n".join(lines) if lines else "",
        "branch": branch,
    }


# ------------------------------------------------------------------ reconcile

def _normalise_code(code: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(code).lower())


def list_branches(dataset_id: str) -> list[dict]:
    rows = db.query(
        """SELECT location_id, COUNT(*) n FROM series_profiles
           WHERE dataset_id = ? AND location_id IS NOT NULL
           GROUP BY location_id ORDER BY location_id""",
        (dataset_id,),
    )
    return [{"location_id": r["location_id"], "series_count": r["n"]} for r in rows]


def reconcile(dataset_id: str, codes: list[str]) -> dict:
    """Match a supplied branch list (e.g. branch -> manager CSV) against the data.

    Real exports disagree on formatting — JKT01, JKT-01, jkt 01 — so matching is
    exact first, then normalised. Normalised matches are returned separately so a
    person confirms them rather than having access granted on a guess. Access
    itself is not granted here: the backend has no auth and stores no users.
    """
    in_data = [b["location_id"] for b in list_branches(dataset_id)]
    data_exact = set(in_data)
    data_norm = defaultdict(list)
    for code in in_data:
        data_norm[_normalise_code(code)].append(code)

    exact, fuzzy, unmatched = [], [], []
    used = set()
    for supplied in codes:
        if supplied in data_exact:
            exact.append({"supplied": supplied, "location_id": supplied})
            used.add(supplied)
            continue
        candidates = data_norm.get(_normalise_code(supplied), [])
        if len(candidates) == 1:
            fuzzy.append({
                "supplied": supplied,
                "location_id": candidates[0],
                "note": "matched after ignoring case, spaces and punctuation — confirm",
            })
            used.add(candidates[0])
        else:
            unmatched.append({
                "supplied": supplied,
                "note": "ambiguous" if candidates else "no branch with this code in the data",
            })

    return {
        "dataset_id": dataset_id,
        "exact": exact,
        "needs_confirmation": fuzzy,
        "not_in_data": unmatched,
        "in_data_but_not_listed": sorted(set(in_data) - used),
    }
