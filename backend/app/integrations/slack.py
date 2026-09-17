"""Outbound alerts.

Slack incoming webhook for the demo. The adapter interface is identical for
WhatsApp Business API, which is what our actual mid-market Indonesian customers
use — say that on stage rather than pretending Slack is the answer.

With no webhook configured the message is returned rather than sent, so the demo
works offline and the judge still sees the payload.
"""

from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
TIMEOUT = 5.0


def format_stockout_alert(recommendations: list[dict]) -> str:
    if not recommendations:
        return "No items at elevated stockout risk."

    lines = [f"*STOCKOUT RISK — {len(recommendations)} item(s) need action*", ""]
    for rec in recommendations:
        days = rec.get("days_until_stockout")
        when = f"{days} days" if days is not None else "not projected"
        lines.append(f"*{rec['series_id']}*")
        lines.append(f"  Projected stockout: {when}")
        lines.append(f"  Recommended order: {rec['recommended_qty']:,.0f} units")
        if rec.get("model_name"):
            accuracy = rec.get("wape")
            suffix = f", backtest WAPE {accuracy:.1%}" if accuracy else ""
            lines.append(f"  Model: {rec['model_name']}{suffix}")
        lines.append("")

    lines.append("_Recommendation only. Approve before raising a purchase order._")
    return "\n".join(lines)


def send_stockout_alert(recommendations: list[dict]) -> dict:
    message = format_stockout_alert(recommendations)

    if not SLACK_WEBHOOK_URL:
        log.info("SLACK_WEBHOOK_URL not set — returning payload instead of sending")
        return {"sent": False, "reason": "no webhook configured", "message": message}

    try:
        response = httpx.post(SLACK_WEBHOOK_URL, json={"text": message}, timeout=TIMEOUT)
        response.raise_for_status()
        return {"sent": True, "message": message}
    except Exception as exc:  # noqa: BLE001 — a failed alert must not break a demo
        log.warning("slack send failed: %s", exc)
        return {"sent": False, "reason": str(exc), "message": message}
