"""MCP server — an interface onto the same service layer, not a second backend.

Run:  py -3.11 -m app.integrations.mcp_server

Design rules, in order of how badly breaking them hurts:

1. Tools call the service layer. No business logic here, ever. The REST API and
   this file must never be able to disagree about what a number means.
2. Reads run freely. Writes need human confirmation — an agent may recommend a
   purchase order, never raise one.
3. Never return a full series. 428 series x 30 days is ~12,800 rows and it will
   blow the agent's context. Top-N with an id to drill into.

Ingestion splits by client: an agent with filesystem access can pass a path and
this server reads the file. A browser session cannot, so there it uploads through
the web app and works by dataset_id afterwards.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db import database as db  # noqa: E402
from app.services import pipeline_service as svc  # noqa: E402

MAX_ROWS = 20

try:
    # MCP 2.x renamed FastMCP to MCPServer. Import the new name first and fall
    # back to the old one, so this runs on whichever SDK version is installed
    # rather than failing at the worst possible moment.
    from mcp.server.mcpserver import MCPServer as _Server
except ImportError:  # pragma: no cover
    try:
        from mcp.server.fastmcp import FastMCP as _Server  # type: ignore
    except ImportError:
        print(
            "MCP SDK not installed. Run: pip install mcp\n"
            "The REST API works without it — MCP is an interface, not a dependency.",
            file=sys.stderr,
        )
        raise SystemExit(1)

mcp = _Server("adaptive-forecasting")


def _latest_dataset() -> str | None:
    row = db.query_one("SELECT dataset_id FROM datasets ORDER BY created_at DESC LIMIT 1")
    return row["dataset_id"] if row else None


def _resolve(dataset_id: str | None) -> str:
    resolved = dataset_id or _latest_dataset()
    if not resolved:
        raise ValueError("no dataset available — upload one first")
    return resolved


@mcp.tool()
def list_datasets() -> str:
    """List uploaded datasets, newest first, with health score and readiness."""
    rows = db.query(
        """SELECT dataset_id, filename, created_at, health_score, preset_matched,
                  mapping_confirmed, decision_mode
           FROM datasets ORDER BY created_at DESC LIMIT 20"""
    )
    return json.dumps([dict(r) for r in rows], indent=2, default=str)


@mcp.tool()
def ingest_csv(path: str) -> str:
    """Ingest a CSV from the local filesystem and profile its schema.

    Only works when this server can see the file — i.e. the agent and the server
    share a filesystem. Returns the dataset_id and the detected column mapping
    with a confidence per field.
    """
    file_path = Path(path).expanduser()
    if not file_path.exists():
        raise ValueError(f"file not found: {file_path}")

    result = svc.ingest(file_path.name, file_path.read_bytes())
    fields = [
        f for f in result["mapping"]["fields"] if f.get("source_column")
    ]
    return json.dumps(
        {
            "dataset_id": result["dataset_id"],
            "rows": result["rows"],
            "preset_matched": result["preset_matched"],
            "detected_mapping": [
                {
                    "field": f["canonical"],
                    "column": f["source_column"],
                    "confidence": f["confidence"],
                    "needs_review": f["confidence"] < 0.80,
                }
                for f in fields
            ],
            "next_step": "confirm_mapping, then run_forecast",
        },
        indent=2,
    )


@mcp.tool()
def confirm_mapping(dataset_id: str, overrides: dict | None = None) -> str:
    """Confirm the detected column mapping, optionally correcting fields.

    overrides maps a canonical field to a source column, e.g.
    {"target": "qty_out"}. Returns the data health report.
    """
    dataset_id = _resolve(dataset_id)
    svc.confirm_mapping(dataset_id, overrides or {})
    health = svc.prepare(dataset_id)
    health.pop("series_excluded", None)
    return json.dumps(health, indent=2, default=str)


@mcp.tool()
def get_data_health(dataset_id: str | None = None) -> str:
    """Data quality report: what we found, what we fixed, what cannot be forecast yet."""
    dataset_id = _resolve(dataset_id)
    health = svc.get_health(dataset_id)
    excluded = health.get("series_excluded", [])[:5]
    summary = {
        "health_score": health.get("health_score"),
        "frequency": health.get("frequency"),
        "series_forecastable": health.get("series_forecastable"),
        "series_total": health.get("series_total"),
        "demand_portfolio": health.get("demand_portfolio"),
        "findings": health.get("findings"),
        "sample_excluded": excluded,
        "excluded_total": health.get("series_excluded_count", 0),
    }
    return json.dumps(summary, indent=2, default=str)


@mcp.tool()
def run_forecast(dataset_id: str | None = None, horizon: int = 30) -> str:
    """Run the full pipeline: segment, backtest candidates, select, forecast, decide.

    Synchronous and may take a minute on a large dataset. Returns the model mix
    chosen by backtesting, not by assumption.
    """
    dataset_id = _resolve(dataset_id)
    result = svc.run_forecast(dataset_id, horizon=horizon)
    return json.dumps(result, indent=2, default=str)


@mcp.tool()
def get_stockout_risk(
    dataset_id: str | None = None, location: str | None = None, top_n: int = 10
) -> str:
    """Items at risk of stocking out, soonest first. The action list."""
    dataset_id = _resolve(dataset_id)
    rows = svc.get_recommendations(dataset_id, limit=min(top_n, MAX_ROWS), risk="high")
    if not rows:
        rows = svc.get_recommendations(dataset_id, limit=min(top_n, MAX_ROWS))

    if location:
        rows = [r for r in rows if (r.get("location_id") or "") == location]

    return json.dumps(
        {
            "dataset_id": dataset_id,
            "count": len(rows),
            "items": [
                {
                    "series_id": r["series_id"],
                    "item": r.get("item_id"),
                    "location": r.get("location_id"),
                    "risk": r["stockout_risk"],
                    "days_until_stockout": r["days_until_stockout"],
                    "recommended_qty": r["recommended_qty"],
                }
                for r in rows
            ],
        },
        indent=2,
        default=str,
    )


@mcp.tool()
def get_reorder_recommendation(series_id: str, dataset_id: str | None = None) -> str:
    """The order quantity for one item, with the arithmetic behind it.

    Every recommendation breaks down into a sum the buyer can check. If it does
    not add up, do not act on it.
    """
    dataset_id = _resolve(dataset_id)
    rows = svc.get_recommendations(dataset_id, limit=500)
    match = next((r for r in rows if r["series_id"] == series_id), None)
    if not match:
        raise ValueError(f"no recommendation for {series_id}")

    return json.dumps(
        {
            "series_id": match["series_id"],
            "mode": match["mode"],
            "recommended_qty": match["recommended_qty"],
            "raw_material_qty": match.get("raw_material_qty"),
            "stockout_risk": match["stockout_risk"],
            "days_until_stockout": match["days_until_stockout"],
            "why": match["explanation"],
            "model_used": match.get("model_name"),
            "backtest_wape": match.get("wape"),
        },
        indent=2,
        default=str,
    )


@mcp.tool()
def explain_forecast(series_id: str, dataset_id: str | None = None) -> str:
    """Why this model was chosen for this series, with every candidate's score.

    Answers the question a judge actually asks: how do you know this is the
    right model for this item?
    """
    dataset_id = _resolve(dataset_id)
    result = svc.get_series_forecast(dataset_id, series_id)
    if not result["selection"]:
        raise ValueError(f"no model selection recorded for {series_id}")

    selection = result["selection"]
    profile = result["profile"] or {}
    return json.dumps(
        {
            "series_id": series_id,
            "demand_class": profile.get("demand_class"),
            "adi": profile.get("adi"),
            "cv2": profile.get("cv2"),
            "censored_periods": profile.get("censored_periods"),
            "model_selected": selection["model_name"],
            "why": selection["reason"],
            "primary_metric": selection["primary_metric"],
            "candidates_evaluated": result["candidates"],
        },
        indent=2,
        default=str,
    )


@mcp.tool()
def get_business_value(dataset_id: str | None = None) -> str:
    """What the recommendations are worth against current practice, in rupiah.

    Both policies face identical demand; the only difference is the forecast
    driving the order.
    """
    dataset_id = _resolve(dataset_id)
    result = svc.get_value_simulation(dataset_id)
    if not result:
        raise ValueError("no simulation yet — run_forecast first")
    return json.dumps(result, indent=2, default=str)


@mcp.tool()
def send_procurement_alert(
    series_ids: list[str], dataset_id: str | None = None, confirmed: bool = False
) -> str:
    """Send a stockout alert to the procurement channel. WRITE ACTION.

    Requires confirmed=True. Call once without it to preview the exact message,
    show that to the human, and only then send. An agent may recommend a
    purchase order; a person raises it.
    """
    dataset_id = _resolve(dataset_id)
    rows = svc.get_recommendations(dataset_id, limit=500)
    selected = [r for r in rows if r["series_id"] in series_ids]
    if not selected:
        raise ValueError("none of those series have recommendations")

    from app.integrations.slack import format_stockout_alert, send_stockout_alert

    if not confirmed:
        return json.dumps(
            {
                "sent": False,
                "requires_confirmation": True,
                "preview": format_stockout_alert(selected),
                "next_step": "show this to the user, then call again with confirmed=True",
            },
            indent=2,
        )

    return json.dumps(send_stockout_alert(selected), indent=2)


if __name__ == "__main__":
    db.init()
    mcp.run()
