"""Read models for the dashboard.

The frontend computes no business values — it formats and filters. Everything it
shows, a backend decided. That is not a preference: two screens disagreeing about
one SKU's risk is the fastest way to lose a demo, so there is exactly one place
that decides, and this is it.

This layer deliberately sits beside the internal service shapes rather than
replacing them. `pipeline_service` stays the engine's own vocabulary; MCP, CSV
export and the smoke test keep reading it unchanged. Here we translate once, into
the shapes `frontend-backend-integration.md` specifies.

The invariants in §9 of that document are enforced here, in one file, because
nothing else can catch them: a count on the Overview and a row count on Supply
Chain are produced by different functions and only agree if they are derived from
the same classification.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import numpy as np
import polars as pl

from ..canonical import (
    CATEGORY,
    INVENTORY,
    LOCATION_ID,
    SERIES_ID,
    TARGET,
    TIMESTAMP,
    split_series_id,
)
from ..db import database as db
from ..decision import params as params_mod
from . import pipeline_service as svc

# ------------------------------------------------------------------ vocabulary

RISK_LABELS = {
    "critical": "Stockout risk",
    "at_risk": "Running low",
    "watch": "Watch",
    "healthy": "Healthy",
}
RISK_ORDER = ["critical", "at_risk", "watch", "healthy"]
ATTENTION = ("critical", "at_risk")

DEMAND_CLASS_META = {
    "smooth": ("Smooth", "Regular intervals, stable volume."),
    "erratic": ("Erratic", "Sells often, but volume swings widely."),
    "intermittent": ("Intermittent", "Long gaps between orders, steady size."),
    "lumpy": ("Lumpy", "Long gaps and unpredictable size — hardest to forecast."),
}

# Order matters: these render in array order, and the index a status maps to
# below is what marks a step done. Backtesting genuinely runs BEFORE the final
# forecast — candidates compete, a winner is picked, then the winner forecasts.
# Listing "Generating forecasts" first made the indicator walk backwards from
# step 5 to step 4 halfway through every run.
JOB_STEPS = [
    ("upload", "File received"),
    ("profile", "Reading the schema"),
    ("clean", "Cleaning and validating"),
    ("classify", "Characterising demand"),
    ("validate", "Backtesting and selecting"),
    ("forecast", "Generating forecasts"),
    ("decide", "Building recommendations"),
]

STAGE_TO_STATUS = {
    "queued": "queued",
    "preparing data": "cleaning",
    "backtesting": "validating",
    "backtesting candidate models": "validating",
    "selecting models and forecasting": "forecasting",
    "building recommendations": "forecasting",
    "simulating business value": "validating",
    "done": "completed",
}

# How far through JOB_STEPS each stage is, kept separate from the status above.
# They are not the same question. `status` is the contract enum the frontend
# types against and has no value for "deciding", so two late stages have to
# share one word; the step indicator has no such constraint and must only ever
# move forward. Deriving the index from the status instead made the tail of
# every run jump backwards — value simulation reports "validating", which sat
# earlier in the list than the recommendations step that had already finished.
STAGE_TO_STEP = {
    "queued": 0,
    "preparing data": 2,
    "backtesting candidate models": 4,
    "backtesting": 4,
    "selecting models and forecasting": 5,
    "building recommendations": 6,
    "simulating business value": 6,
    "done": len(JOB_STEPS),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify_risk(
    days_until_stockout: int | None, coverage_days: float, lead_time_days: int
) -> str:
    """The single definition of risk. Every screen reads this one.

    Anchored on lead time rather than a fixed day count: seven days of cover is
    comfortable when a supplier delivers in three and an emergency when they take
    twenty-one.
    """
    if days_until_stockout is not None and days_until_stockout <= lead_time_days:
        return "critical"
    if days_until_stockout is not None:
        return "at_risk"
    if coverage_days < lead_time_days * 2:
        return "watch"
    return "healthy"


def _confidence_band(score: float) -> str:
    if score >= 0.90:
        return "high"
    if score >= 0.75:
        return "medium"
    return "low"


def _maybe(value, reason: str) -> dict:
    if value is None:
        return {"available": False, "reason": reason}
    return {"available": True, "value": value}


# ------------------------------------------------------------------- internals

def _dataset_row(dataset_id: str):
    row = db.query_one("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
    if not row:
        raise KeyError(dataset_id)
    return row


def _horizon_days(dataset_id: str) -> int:
    row = db.query_one(
        """SELECT COUNT(DISTINCT timestamp) AS n, MIN(timestamp) AS a, MAX(timestamp) AS b
           FROM forecasts WHERE dataset_id = ?""",
        (dataset_id,),
    )
    if not row or not row["n"]:
        return 30
    try:
        span = (datetime.fromisoformat(row["b"]) - datetime.fromisoformat(row["a"])).days
        return max(span + 1, row["n"])
    except (TypeError, ValueError):
        return int(row["n"])


def _enriched_rows(dataset_id: str, limit: int = 100_000) -> list[dict]:
    """Recommendations with the derived fields every screen shares.

    Risk is decided once, here, so Overview counts and Supply Chain rows cannot
    disagree.
    """
    raw = svc.get_recommendations(dataset_id, limit=limit)
    if not raw:
        return []

    store = params_mod.load_all(dataset_id)
    categories = svc._series_categories(dataset_id)

    horizon = _horizon_days(dataset_id)
    totals = {
        r["series_id"]: r["total"]
        for r in db.query(
            """SELECT series_id, SUM(forecast) AS total FROM forecasts
               WHERE dataset_id = ? GROUP BY series_id""",
            (dataset_id,),
        )
    }

    rows: list[dict] = []
    for r in raw:
        series_id = r["series_id"]
        item_id, location_id = split_series_id(series_id)
        category = categories.get(series_id) or "Uncategorised"
        series_params, _ = params_mod.resolve(
            dataset_id, series_id=series_id, category=category, cached=store
        )

        explanation = r.get("explanation") or []
        lead_demand = next(
            (v["value"] for v in explanation if str(v["label"]).startswith("Demand during")),
            0.0,
        )
        safety = next(
            (v["value"] for v in explanation if str(v["label"]).startswith("Safety buffer")),
            0.0,
        )
        stock = -next(
            (v["value"] for v in explanation if v["label"] == "Current stock"), 0.0
        )

        forecast_demand = float(totals.get(series_id) or 0.0)
        daily = forecast_demand / max(horizon, 1)
        coverage = (stock / daily) if daily > 0 else float(horizon)
        days_out = r.get("days_until_stockout")
        risk = classify_risk(days_out, coverage, series_params.lead_time_days)

        rows.append({
            "series_id": series_id,
            "item_id": item_id,
            "item_name": item_id,
            "location_id": location_id or "",
            "location": location_id or "All locations",
            "category": category,
            "current_stock": round(stock, 1),
            "forecast_demand": round(forecast_demand, 1),
            "lead_time_demand": round(float(lead_demand), 1),
            "safety_stock": round(float(safety), 1),
            "coverage_days": int(round(min(coverage, 999))),
            "days_until_stockout": days_out,
            "risk": risk,
            "risk_label": RISK_LABELS[risk],
            "recommended_qty": round(float(r.get("recommended_qty") or 0), 1),
            "lead_time_days": series_params.lead_time_days,
            "moq": series_params.moq,
            "demand_class": r.get("demand_class") or "smooth",
            "model": r.get("model_name") or "—",
            "wape_percent": round((r.get("wape") or 0) * 100, 1),
            "explanation": _explanation(explanation, float(r.get("recommended_qty") or 0)),
            "recent_demand": [],
            "_reason": r.get("reason") or "",
        })

    rows.sort(key=lambda x: (RISK_ORDER.index(x["risk"]), -(x["recommended_qty"])))
    return rows


def _explanation(lines: list[dict], recommended: float) -> dict:
    """Signed contributions that must sum to the recommended quantity.

    Rendered as an accounting breakdown directly under the number, so if these
    do not add up the "no black box" promise fails in the most visible way
    available. Any residual from rounding is folded into the adjustment line
    rather than left to show as a discrepancy.
    """
    out = []
    for line in lines:
        label = str(line["label"])
        value = float(line["value"])
        if value < 0:
            kind = "subtract"
        elif "MOQ" in label or "adjust" in label.lower():
            kind = "adjust"
        else:
            kind = "add"
        out.append({"label": label, "value": round(value, 1), "kind": kind})

    residual = round(recommended - sum(v["value"] for v in out), 1)
    if abs(residual) >= 0.1:
        adjust = next((v for v in out if v["kind"] == "adjust"), None)
        if adjust:
            adjust["value"] = round(adjust["value"] + residual, 1)
        else:
            out.append({"label": "Rounding", "value": residual, "kind": "adjust"})

    return {
        "lines": out,
        "total_label": "Recommended order",
        "total_value": round(recommended, 1),
    }


def _aggregate_chart(dataset_id: str, series_filter: set[str] | None = None) -> dict:
    """Actual and forecast summed across series, stitched at the join.

    The stitch matters: the last observed point also carries forecast, lower and
    upper equal to its actual, otherwise the two lines show a one-period gap at
    exactly the moment the eye is drawn to.
    """
    canonical, frequency, _, _ = svc._load_canonical(dataset_id)
    if series_filter is not None:
        canonical = canonical.filter(pl.col(SERIES_ID).is_in(list(series_filter)))

    history = (
        canonical.group_by(TIMESTAMP)
        .agg(pl.col(TARGET).sum().alias("actual"))
        .sort(TIMESTAMP)
    )

    sql = """SELECT timestamp, SUM(forecast) f, SUM(lower) lo, SUM(upper) up
             FROM forecasts WHERE dataset_id = ?"""
    args: tuple = (dataset_id,)
    if series_filter is not None and not series_filter:
        sql += " AND 1 = 0"
    elif series_filter:
        marks = ",".join("?" * len(series_filter))
        sql += f" AND series_id IN ({marks})"
        args = (dataset_id, *series_filter)
    sql += " GROUP BY timestamp ORDER BY timestamp"
    forecast_rows = db.query(sql, args)

    # Keep the chart readable: at most ~120 historical points.
    hist = history.tail(120)
    points: list[dict] = []
    for row in hist.iter_rows(named=True):
        points.append({
            "t": str(row[TIMESTAMP])[:10],
            "actual": round(float(row["actual"]), 1),
            "forecast": None,
            "lower": None,
            "upper": None,
        })

    cutoff_index = len(points) - 1
    if points:
        last = points[cutoff_index]
        last["forecast"] = last["actual"]
        last["lower"] = last["actual"]
        last["upper"] = last["actual"]

    for row in forecast_rows:
        f = float(row["f"] or 0)
        lo = float(row["lo"]) if row["lo"] is not None else f
        up = float(row["up"]) if row["up"] is not None else f
        # The band is drawn as a polygon and inverts visibly if this is violated.
        lo, up = min(lo, f), max(up, f)
        points.append({
            "t": str(row["timestamp"])[:10],
            "actual": None,
            "forecast": round(f, 1),
            "lower": round(lo, 1),
            "upper": round(up, 1),
        })

    historical = [p for p in points if p["actual"] is not None]
    predicted = [p for p in points if p["actual"] is None]
    return {
        "label": "Actual vs forecast demand",
        "cutoff_index": max(cutoff_index, 0),
        "points": points,
        "historical_range": {
            "from": historical[0]["t"] if historical else "",
            "to": historical[-1]["t"] if historical else "",
        },
        "forecast_range": {
            "from": predicted[0]["t"] if predicted else "",
            "to": predicted[-1]["t"] if predicted else "",
        },
        "unit": "units",
    }


# -------------------------------------------------------------------- projects

def projects(tenant_id: str | None = None) -> list[dict]:
    """Every project this tenant owns. Never another tenant's."""
    from .. import security

    sql = """SELECT dataset_id, filename, created_at, health_score, frequency,
                    decision_mode, mapping_confirmed, health_report
             FROM datasets"""
    params: tuple = ()
    if security.tenancy_enabled():
        sql += " WHERE tenant_id IS ?"
        params = (tenant_id,)
    rows = db.query(sql + " ORDER BY created_at DESC LIMIT 50", params)
    out = []
    for row in rows:
        out.append(_project_from_row(row))
    return out


def project(project_id: str) -> dict:
    dataset_id = project_id.replace("prj-", "", 1) if project_id.startswith("prj-") else project_id
    return _project_from_row(_dataset_row(dataset_id))


def _project_from_row(row) -> dict:
    dataset_id = row["dataset_id"]
    health = db.from_json(row["health_report"], {}) or {}

    forecast_row = db.query_one(
        "SELECT COUNT(*) n FROM forecasts WHERE dataset_id = ?", (dataset_id,)
    )
    has_forecast = bool(forecast_row and forecast_row["n"])

    job = db.query_one(
        """SELECT status, updated_at FROM jobs WHERE dataset_id = ?
           ORDER BY created_at DESC LIMIT 1""",
        (dataset_id,),
    )

    if has_forecast:
        status = "ready"
    elif job and job["status"] == "running":
        status = "processing"
    elif job and job["status"] == "failed":
        status = "failed"
    else:
        status = "needs_review"

    return {
        "project_id": f"prj-{dataset_id}",
        "name": str(row["filename"]).rsplit(".", 1)[0][:60],
        "organisation": _organisation_from(row["filename"]),
        "industry_mode": row["decision_mode"] or "ritel",
        "dataset_id": dataset_id,
        "dataset_filename": row["filename"],
        "uploaded_at": row["created_at"],
        "forecast_generated_at": job["updated_at"] if (job and has_forecast) else None,
        "last_opened_at": row["created_at"],
        "status": status,
        "horizon_days": _horizon_days(dataset_id) if has_forecast else 30,
        "series_total": health.get("series_total", 0),
        "health_score": row["health_score"] or 0,
        "demand_sparkline": _sparkline(dataset_id),
    }


def _organisation_from(filename: str) -> str:
    stem = str(filename).rsplit(".", 1)[0].replace("_", " ").replace("-", " ")
    return stem.title()[:60] or "Unknown"


def _sparkline(dataset_id: str, points: int = 16) -> list[float]:
    rows = db.query(
        """SELECT timestamp, SUM(forecast) v FROM forecasts WHERE dataset_id = ?
           GROUP BY timestamp ORDER BY timestamp""",
        (dataset_id,),
    )
    values = [float(r["v"] or 0) for r in rows]
    if not values:
        return []
    if len(values) <= points:
        return [round(v, 1) for v in values]
    step = len(values) / points
    return [round(values[min(int(i * step), len(values) - 1)], 1) for i in range(points)]


# -------------------------------------------------------------------- overview

def overview(dataset_id: str, location: str | None = None) -> dict:
    """Overview for the whole network, or for one branch.

    Scoping happens here, before anything is serialised. A branch manager's
    overview built from every branch and filtered in the browser is a display
    filter, not a security boundary — the other branches' KPIs and priority
    actions would already be in the response.
    """
    _dataset_row(dataset_id)
    rows = _enriched_rows(dataset_id)
    scoped_series: set[str] | None = None
    if location:
        rows = [r for r in rows if r["location_id"] == location]
        scoped_series = {r["series_id"] for r in rows}
    health = svc.get_health(dataset_id) or {}
    horizon = _horizon_days(dataset_id)

    attention = [r for r in rows if r["risk"] in ATTENTION]
    total_forecast = sum(r["forecast_demand"] for r in rows)
    units_to_order = sum(r["recommended_qty"] for r in rows)

    # Inventory value needs unit cost, which a sales export does not carry.
    # Missing is not zero: say why rather than showing a confident 0.
    store = params_mod.load_all(dataset_id)
    default_params, _ = params_mod.resolve(dataset_id, cached=store)
    stock_units = sum(r["current_stock"] for r in rows)
    if default_params.unit_cost > 0:
        inventory_value = _maybe(round(stock_units * default_params.unit_cost, 0), "")
    else:
        inventory_value = _maybe(None, "Unit cost has not been provided for this dataset.")

    coverages = sorted(r["coverage_days"] for r in rows)
    median_coverage = coverages[len(coverages) // 2] if coverages else 0
    orderable = sum(1 for r in rows if r["recommended_qty"] > 0)

    kpis = [
        {
            "key": "demand_forecast",
            "label": "Demand Forecast",
            "value": round(total_forecast, 0),
            "unavailable_reason": None,
            "unit": "units",
            "context": f"Next {horizon} days · {len(rows)} series",
            "comparison": _demand_comparison(dataset_id, total_forecast, horizon, scoped_series),
            "accent": "forecast",
            "href": None,
        },
        {
            "key": "needs_attention",
            "label": "Needs Attention",
            "value": len(attention),
            "unavailable_reason": None,
            "unit": "count",
            "context": f"of {len(rows)} series at stockout risk or running low",
            "comparison": None,
            "accent": "risk",
            "href": None,
        },
        {
            "key": "units_to_order",
            "label": "Units To Order",
            "value": round(units_to_order, 0),
            "unavailable_reason": None,
            "unit": "units",
            "context": f"across {orderable} items",
            "comparison": None,
            "accent": "inventory",
            "href": None,
        },
        {
            "key": "inventory_value",
            "label": "Inventory Value",
            "value": inventory_value["value"] if inventory_value["available"] else None,
            "unavailable_reason": None if inventory_value["available"] else inventory_value["reason"],
            "unit": "idr",
            "context": f"{stock_units:,.0f} units on hand",
            "comparison": None,
            "accent": "inventory",
            "href": None,
        },
    ]

    bands = []
    for risk in RISK_ORDER:
        count = sum(1 for r in rows if r["risk"] == risk)
        if count:
            bands.append({"risk": risk, "label": RISK_LABELS[risk], "series_count": count})

    priority = []
    for rank, row in enumerate(attention[:8], start=1):
        days = row["days_until_stockout"]
        priority.append({
            "rank": rank,
            "series_id": row["series_id"],
            "item_name": row["item_name"],
            "location": row["location"],
            "headline": f"Order {row['recommended_qty']:,.0f} units",
            "reason": (
                f"{row['coverage_days']} days of cover against a "
                f"{row['lead_time_days']}-day lead time."
            ),
            "risk": row["risk"],
            "metric_label": "Days until stockout" if days is not None else "Days of cover",
            "metric_value": days if days is not None else row["coverage_days"],
            "metric_unit": "days",
            "href": None,
        })

    return {
        "dataset_id": dataset_id,
        "generated_at": _now(),
        "kpis": kpis,
        "demand_chart": _aggregate_chart(dataset_id, scoped_series),
        "scope": {"location_id": location} if location else {"location_id": None},
        "inventory": {
            "bands": bands,
            "total_series": len(rows),
            "inventory_value": inventory_value,
            "median_coverage_days": median_coverage,
            "narrative": _narrative(rows, attention, median_coverage),
        },
        "priority_actions": priority,
    }


def _demand_comparison(
    dataset_id: str,
    total_forecast: float,
    horizon: int,
    series: set[str] | None = None,
) -> dict | None:
    """The horizon against the same number of days immediately before it."""
    canonical, frequency, _, _ = svc._load_canonical(dataset_id)
    if series is not None:
        canonical = canonical.filter(pl.col(SERIES_ID).is_in(list(series)))
    end = canonical.get_column(TIMESTAMP).max()
    if end is None:
        return None
    prior = canonical.filter(
        pl.col(TIMESTAMP) > (end - timedelta(days=horizon))
    ).get_column(TARGET).sum()
    prior = float(prior or 0)
    if prior <= 0:
        return None
    delta = (total_forecast - prior) / prior * 100
    return {
        "delta_percent": round(delta, 1),
        "direction": "up" if delta > 0.5 else ("down" if delta < -0.5 else "flat"),
        "label": f"vs previous {horizon} days",
    }


def _narrative(rows, attention, median_coverage) -> str:
    if not rows:
        return "No recommendations yet — run a forecast to populate this view."
    if not attention:
        return (
            f"Cover looks adequate across all {len(rows)} series, with a median of "
            f"{median_coverage} days. Nothing needs ordering urgently."
        )
    worst = attention[0]
    return (
        f"{len(attention)} of {len(rows)} series need attention. "
        f"{worst['item_name']} at {worst['location']} is tightest, with "
        f"{worst['coverage_days']} days of cover against a "
        f"{worst['lead_time_days']}-day lead time. "
        f"Median cover across the portfolio is {median_coverage} days."
    )


# --------------------------------------------------------------- demand & sales

DATE_RANGES = {"18m": 548, "12m": 365, "6m": 183, "90d": 90}


def demand(
    dataset_id: str,
    date_range: str = "18m",
    product: str = "all",
    location: str = "all",
    compare: str = "forecast",
) -> dict:
    _dataset_row(dataset_id)
    # Echo back what we actually used. If a parameter is clamped or ignored, the
    # controls render from active_filters, so saying so keeps the UI honest.
    date_range = date_range if date_range in DATE_RANGES else "18m"
    compare = compare if compare in ("forecast", "sales", "baseline", "none") else "forecast"

    profiles = db.query(
        """SELECT series_id, item_id, location_id, demand_class, category
           FROM series_profiles WHERE dataset_id = ? AND forecastable = 1""",
        (dataset_id,),
    )
    selected = {
        r["series_id"] for r in profiles
        if (product == "all" or r["item_id"] == product)
        and (location == "all" or (r["location_id"] or "") == location)
    }
    narrowed = selected if len(selected) < len(profiles) else None

    counts: dict[str, int] = {}
    for r in profiles:
        key = r["demand_class"] or "smooth"
        counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values()) or 1

    typical: dict[str, str] = {}
    for r in db.query(
        """SELECT s.demand_class d, m.model_name mn, COUNT(*) n
           FROM model_selection m JOIN series_profiles s
             ON s.dataset_id = m.dataset_id AND s.series_id = m.series_id
           WHERE m.dataset_id = ? GROUP BY s.demand_class, m.model_name
           ORDER BY n DESC""",
        (dataset_id,),
    ):
        typical.setdefault(r["d"], r["mn"])

    classes = []
    for demand_class, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        label, description = DEMAND_CLASS_META.get(demand_class, (demand_class.title(), ""))
        classes.append({
            "demand_class": demand_class,
            "label": label,
            "series_count": count,
            "share_percent": round(count / total * 100, 1),
            "description": description,
            "typical_model": typical.get(demand_class, "—"),
        })
    _force_shares_to_100(classes)

    return {
        "dataset_id": dataset_id,
        "chart": _aggregate_chart(dataset_id, narrowed),
        "accuracy": _accuracy(dataset_id),
        "pattern": {"classes": classes, "total_series": total},
        "sales_by_product": _category_bars(dataset_id, "item_id"),
        "sales_by_location": _category_bars(dataset_id, "location_id"),
        "forecast_rows": _forecast_rows(dataset_id, narrowed),
        "filters": {
            "products": _options(profiles, "item_id", "All products"),
            "locations": _options(profiles, "location_id", "All locations"),
            "date_presets": [
                {"value": "18m", "label": "Last 18 months"},
                {"value": "12m", "label": "Last 12 months"},
                {"value": "6m", "label": "Last 6 months"},
                {"value": "90d", "label": "Last 90 days"},
            ],
            "comparisons": [
                {"value": "forecast", "label": "Forecast"},
                {"value": "sales", "label": "Actual sales"},
                {"value": "baseline", "label": "Baseline"},
                {"value": "none", "label": "None"},
            ],
        },
        "active_filters": {
            "date_range": date_range,
            "product": product,
            "location": location,
            "compare": compare,
        },
        "horizon_label": f"Next {_horizon_days(dataset_id)} days",
    }


def _force_shares_to_100(classes: list[dict]) -> None:
    """Rounding can leave the shares at 99.9, and the bar is drawn from them."""
    if not classes:
        return
    drift = round(100.0 - sum(c["share_percent"] for c in classes), 1)
    if abs(drift) >= 0.1:
        classes[0]["share_percent"] = round(classes[0]["share_percent"] + drift, 1)


def _accuracy(dataset_id: str) -> dict:
    overall = db.query_one(
        "SELECT AVG(wape) w, AVG(bias) b, AVG(mase) m FROM model_selection WHERE dataset_id = ?",
        (dataset_id,),
    )
    top = db.query_one(
        """SELECT model_name, reason, COUNT(*) n FROM model_selection
           WHERE dataset_id = ? GROUP BY model_name ORDER BY n DESC LIMIT 1""",
        (dataset_id,),
    )
    baseline = db.query_one(
        """SELECT AVG(wape) w FROM model_selection
           WHERE dataset_id = ? AND model_name LIKE '%naive%'""",
        (dataset_id,),
    )
    if not top:
        return {
            "model_name": "—",
            "model_reason": "No forecast has been run yet.",
            "wape_percent": 0.0,
            "bias_percent": 0.0,
            "mase": None,
            "baseline_name": "Seasonal naive",
            "baseline_wape_percent": 0.0,
            "validation_windows": 0,
        }

    wape = float(overall["w"] or 0) * 100
    base = float(baseline["w"] or 0) * 100 if baseline and baseline["w"] else 0.0
    return {
        "model_name": top["model_name"],
        "model_reason": top["reason"] or "Selected per series from rolling validation windows.",
        "wape_percent": round(wape, 1),
        "bias_percent": round(float(overall["b"] or 0) * 100, 1),
        "mase": round(float(overall["m"]), 3) if overall and overall["m"] else None,
        "baseline_name": "Seasonal naive",
        # Only claim a baseline number we actually measured.
        "baseline_wape_percent": round(base, 1) if base else round(wape, 1),
        "validation_windows": 2,
    }


def _category_bars(dataset_id: str, key: str) -> list[dict]:
    rows = db.query(
        f"""SELECT s.{key} k, SUM(f.forecast) v
            FROM forecasts f JOIN series_profiles s
              ON s.dataset_id = f.dataset_id AND s.series_id = f.series_id
            WHERE f.dataset_id = ? AND s.{key} IS NOT NULL
            GROUP BY s.{key} ORDER BY v DESC LIMIT 12""",
        (dataset_id,),
    )
    total = sum(float(r["v"] or 0) for r in rows) or 1.0
    return [
        {
            "key": str(r["k"]),
            "label": str(r["k"]),
            "sublabel": None,
            "value": round(float(r["v"] or 0), 1),
            "share_percent": round(float(r["v"] or 0) / total * 100, 1),
        }
        for r in rows
    ]


def _forecast_rows(dataset_id: str, selected: set[str] | None, limit: int = 500) -> list[dict]:
    rows = db.query(
        """SELECT f.series_id, f.timestamp, f.forecast, f.lower, f.upper, f.model_name,
                  s.item_id, s.location_id
           FROM forecasts f LEFT JOIN series_profiles s
             ON s.dataset_id = f.dataset_id AND s.series_id = f.series_id
           WHERE f.dataset_id = ? ORDER BY f.timestamp, f.series_id LIMIT ?""",
        (dataset_id, limit * 6),
    )
    out = []
    for r in rows:
        if selected is not None and r["series_id"] not in selected:
            continue
        forecast = float(r["forecast"] or 0)
        out.append({
            "date": str(r["timestamp"])[:10],
            "series_id": r["series_id"],
            "item_name": r["item_id"] or r["series_id"],
            "location": r["location_id"] or "—",
            "forecast": round(forecast, 1),
            "lower": round(float(r["lower"]) if r["lower"] is not None else forecast, 1),
            "upper": round(float(r["upper"]) if r["upper"] is not None else forecast, 1),
            "actual": None,
            "model": r["model_name"] or "—",
        })
        if len(out) >= limit:
            break
    return out


def _options(profiles, key: str, all_label: str) -> list[dict]:
    values = sorted({str(r[key]) for r in profiles if r[key]})
    return [{"value": "all", "label": all_label}] + [
        {"value": v, "label": v} for v in values[:200]
    ]


# --------------------------------------------------------------- supply chain

def supply_chain(
    dataset_id: str,
    risk: str = "all",
    location: str = "all",
    category: str = "all",
) -> dict:
    row = _dataset_row(dataset_id)
    rows = _enriched_rows(dataset_id)

    # `attention` means critical or at_risk. The Overview KPI links straight to
    # it, so it has to resolve to exactly the rows that KPI counted.
    def keep(r: dict) -> bool:
        if risk == "attention" and r["risk"] not in ATTENTION:
            return False
        if risk not in ("all", "attention") and r["risk"] != risk:
            return False
        if location != "all" and r["location_id"] != location:
            return False
        if category != "all" and r["category"] != category:
            return False
        return True

    filtered = [r for r in rows if keep(r)]
    attention = [r for r in filtered if r["risk"] in ATTENTION]
    units = sum(r["recommended_qty"] for r in filtered)

    summary = []
    for level in RISK_ORDER:
        group = [r for r in filtered if r["risk"] == level]
        if group:
            summary.append({
                "risk": level,
                "label": RISK_LABELS[level],
                "series_count": len(group),
                "recommended_units": round(sum(r["recommended_qty"] for r in group), 1),
            })

    locations = sorted({r["location_id"] for r in rows if r["location_id"]})
    categories = sorted({r["category"] for r in rows if r["category"]})

    clean_rows = []
    for r in filtered:
        item = {k: v for k, v in r.items() if not k.startswith("_")}
        clean_rows.append(item)

    return {
        "dataset_id": dataset_id,
        "generated_at": _now(),
        "mode": row["decision_mode"] or "ritel",
        "rows": clean_rows,
        "headline": {
            "attention_count": len(attention),
            "total_count": len(filtered),
            "units_to_order": round(units, 1),
            "detail": (
                f"{len(attention)} of {len(filtered)} series need attention, "
                f"totalling {units:,.0f} units to order."
                if attention
                else f"No series need urgent attention across {len(filtered)} tracked."
            ),
        },
        "summary": summary,
        "filters": {
            "locations": [{"value": "all", "label": "All locations"}]
            + [{"value": v, "label": v} for v in locations],
            "categories": [{"value": "all", "label": "All categories"}]
            + [{"value": v, "label": v} for v in categories],
            "risks": [
                {"value": "all", "label": "All"},
                {"value": "attention", "label": "Needs attention"},
                *[{"value": k, "label": RISK_LABELS[k]} for k in RISK_ORDER],
            ],
        },
    }


# ----------------------------------------------------------------------- value

def value(dataset_id: str) -> dict | None:
    result = svc.get_value_simulation(dataset_id)
    if not result:
        return None
    base, prop, delta = result["baseline"], result["proposed"], result["delta"]
    scope = result.get("scope", {})
    return {
        "dataset_id": dataset_id,
        "baseline_name": base.get("label", "Current practice"),
        "fill_rate_baseline_percent": round(float(base.get("fill_rate", 0)) * 100, 1),
        "fill_rate_model_percent": round(float(prop.get("fill_rate", 0)) * 100, 1),
        "stockout_events_baseline": int(base.get("stockout_events", 0)),
        "stockout_events_model": int(prop.get("stockout_events", 0)),
        "avg_inventory_value_baseline": round(float(base.get("avg_inventory_value", 0)), 0),
        "avg_inventory_value_model": round(float(prop.get("avg_inventory_value", 0)), 0),
        "net_benefit_idr": round(float(delta.get("total_benefit", 0)), 0),
        "window_label": (
            f"{scope.get('series', 0)} series over {scope.get('periods', 0)} periods"
        ),
    }


# --------------------------------------------------------------- mapping view

FIELD_LABELS = {
    "timestamp": "Date",
    "target": "Demand Quantity",
    "item_id": "Product",
    "location_id": "Location",
    "inventory": "Inventory on hand",
    "price": "Unit price",
    "promo": "Promotion flag",
    "category": "Category",
    "lead_time": "Lead time",
    "moq": "Minimum order quantity",
}
REQUIRED_FIELDS = ("timestamp", "target")


def mapping(dataset_id: str) -> dict:
    row = _dataset_row(dataset_id)
    sources = svc.list_sources(dataset_id)
    stored = db.from_json(row["schema_mapping"], {"fields": []}) or {"fields": []}

    raw_columns: list[str] = []
    samples: dict[str, list[str]] = {}
    try:
        df, _ = svc.read_reshaped(__import__("pathlib").Path(row["raw_path"]))
        raw_columns = list(df.columns)
        for name in raw_columns[:60]:
            values = df.get_column(name).drop_nulls().head(3).to_list()
            samples[name] = [str(v) for v in values]
    except Exception:  # noqa: BLE001 — samples are a nicety, not a dependency
        pass

    fields = []
    mapped_columns = set()
    scores = []
    for field in stored.get("fields", []):
        column = field.get("source_column")
        if not column:
            continue
        mapped_columns.add(column)
        score = float(field.get("confidence", 0))
        scores.append(score)
        canonical = field["canonical"]
        reason = field.get("reason", "")

        if "matched" in reason and "export" in reason:
            resolved_by = "preset"
        elif "unpivot" in reason or "inferred from column semantics" in reason:
            resolved_by = "model" if "semantics" in reason else "rule"
        else:
            resolved_by = "rule"

        fields.append({
            "source_column": column,
            "detected_field": FIELD_LABELS.get(canonical, canonical.replace("_", " ").title()),
            "canonical_key": canonical,
            "confidence": _confidence_band(score),
            "confidence_score": round(score, 2),
            "resolved_by": resolved_by,
            "reasoning": _humanise_reason(reason, column, canonical),
            "sample_values": samples.get(column, []),
            "required": canonical in REQUIRED_FIELDS,
            "alternatives": [
                {"canonical_key": k, "label": v}
                for k, v in FIELD_LABELS.items()
                if k != canonical
            ][:8] + [{"canonical_key": "ignore", "label": "Do not use this column"}],
        })

    overall = _confidence_band(min(scores)) if scores else "low"
    return {
        "dataset_id": dataset_id,
        "preset_matched": row["preset_matched"],
        "overall_confidence": overall,
        "fields": fields,
        "unmapped_columns": [c for c in raw_columns if c not in mapped_columns],
        "sources": sources,
    }


def _humanise_reason(reason: str, column: str, canonical: str) -> str:
    """Written for a planner, not for a log file — it is rendered verbatim."""
    if not reason:
        return f"Matched '{column}' to {FIELD_LABELS.get(canonical, canonical)}."
    text = reason.replace(" · ", ". ").strip()
    if not text.endswith("."):
        text += "."
    return text[0].upper() + text[1:]


# ---------------------------------------------------------------- health view

FINDING_TITLES = {
    "duplicate": ("duplicates", "warning"),
    "missing": ("gaps", "warning"),
    "negative": ("returns", "info"),
    "unreadable": ("dates", "critical"),
    "stock": ("censoring", "warning"),
    "discontinued": ("lifecycle", "warning"),
    "seasonal": ("seasonal", "info"),
    "slow": ("slow_movers", "info"),
    "dormant": ("dead_stock", "warning"),
    "frequency": ("frequency", "info"),
    "ready": ("coverage", "info"),
}


def health(dataset_id: str) -> dict:
    row = _dataset_row(dataset_id)
    report = svc.get_health(dataset_id) or {}
    cleaning = report.get("cleaning", {})
    pii_report = db.from_json(row["pii_report"], {}) or {}

    excluded = report.get("series_excluded", [])
    total = report.get("series_total", 0)
    forecastable = report.get("series_forecastable", 0)

    # The review screen states both numbers, so the list has to be the whole
    # list rather than a sample or the page contradicts itself.
    missing_count = (total - forecastable) - len(excluded)
    if missing_count > 0:
        excluded = excluded + [
            {"series_id": "(not listed)", "reason": "Excluded during preparation"}
            for _ in range(missing_count)
        ]

    findings = []
    for item in report.get("findings", []):
        text = item.get("text", "")
        severity = {"ok": "info", "warn": "warning", "error": "critical"}.get(
            item.get("level", "info"), "info"
        )
        key = next((k for k in FINDING_TITLES if k in text.lower()), "general")
        finding_id, _default = FINDING_TITLES.get(key, ("general", "info"))
        findings.append({
            "id": finding_id,
            "severity": severity,
            "title": text[:90],
            "detail": text,
            "action": _finding_action(finding_id),
        })

    # Personal data goes first: it is the one finding that is about the file
    # rather than the forecast, and the moment to act on it is now.
    from ..schema import pii as pii_mod

    pii_finding = pii_mod.as_finding(pii_report)
    if pii_finding:
        findings.insert(0, pii_finding)

    span = 0
    try:
        start = datetime.fromisoformat(str(report.get("history_start"))[:19])
        end = datetime.fromisoformat(str(report.get("history_end"))[:19])
        span = max(0, (end.year - start.year) * 12 + end.month - start.month)
    except (TypeError, ValueError):
        pass

    return {
        "dataset_id": dataset_id,
        "rows_received": cleaning.get("rows_received", 0),
        "duplicates_found": cleaning.get("duplicates_found", 0),
        "missing_timestamps": cleaning.get("missing_timestamps", 0),
        "negative_values": cleaning.get("negative_values", 0),
        "series_total": total,
        "series_forecastable": forecastable,
        "series_excluded": [
            {"series_id": e.get("series_id", ""), "reason": e.get("reason", "")}
            for e in excluded
        ],
        "detected_frequency": str(report.get("frequency", "daily")).title(),
        "history_span_months": span,
        "health_score": report.get("health_score", 0),
        "findings": findings,
        "lifecycle": report.get("lifecycle", {}),
        "dead_stock": report.get("dead_stock", {}),
        "censoring": report.get("censoring", {}),
        "personal_data": pii_report,
    }


def _finding_action(finding_id: str) -> str | None:
    return {
        "censoring": "Send stock levels so stockouts can be measured rather than inferred",
        "lifecycle": "Confirm which items are discontinued",
        "dead_stock": "Review dormant items still holding stock",
        "dates": "Check the date format in the source export",
        "duplicates": "No action needed — duplicates were aggregated",
    }.get(finding_id)


# ------------------------------------------------------------------- job view

def job(job_id: str) -> dict:
    row = db.query_one("SELECT * FROM jobs WHERE job_id = ?", (job_id,))
    if not row:
        raise KeyError(job_id)

    stage = (row["stage"] or "queued").lower()
    progress = int(row["progress"] or 0)
    status = STAGE_TO_STATUS.get(stage, "profiling")
    if row["status"] == "completed":
        status, progress = "completed", 100
    elif row["status"] == "failed":
        status = "failed"

    # Step keys stay constant across polls so rows never reorder mid-run, and
    # the index comes from the stage the pipeline reported rather than from the
    # status word, so it only ever advances.
    reached = STAGE_TO_STEP.get(stage, 1)
    if row["status"] == "completed":
        reached = len(JOB_STEPS)
    elif row["status"] == "failed":
        reached = min(reached, len(JOB_STEPS) - 1)

    steps = []
    for index, (key, label) in enumerate(JOB_STEPS):
        if status == "failed" and index == reached:
            state = "failed"
        elif index < reached:
            state = "done"
        elif index == reached:
            state = "active"
        else:
            state = "pending"
        steps.append({"key": key, "label": label, "state": state, "detail": None})

    return {
        "job_id": row["job_id"],
        "dataset_id": row["dataset_id"],
        "status": status,
        "progress": max(0, min(100, progress)),
        "steps": steps,
        "message": row["error"] if row["status"] == "failed" else (row["stage"] or None),
    }
