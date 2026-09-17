"""Branch notifications.

A branch manager will not log into a dashboard every morning. They will read a
short message. So the digest is pushed, and the design effort goes into the part
that decides whether it is still read in a month: not sending noise.

Three anti-spam rules, each enforced here rather than left to the caller:

1. **One digest per branch**, not one message per item.
2. **Only when something needs doing.** A branch with nothing actionable gets no
   message at all. "Everything is fine" every day trains people to mute you.
3. **No repeats.** An item already reported is not sent again unless its risk got
   worse. A manager who saw SKU-054 yesterday does not need it again today.

Channels are adapters, the same shape as the forecasting models: email today,
WhatsApp as the next adapter. WhatsApp is the right channel for this market, but
the Business API needs Meta verification that takes days, so it is not faked.

Recipients are NOT stored here. The backend has no authentication; who manages
which branch lives in the frontend's auth layer. The caller — a server action
that has already checked access — passes recipients in. Storing them here would
let anyone who can reach the backend route a branch's data to any address.
"""

from __future__ import annotations

import logging
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

from ..db import database as db

log = logging.getLogger(__name__)

RISK_SEVERITY = {"healthy": 0, "watch": 1, "at_risk": 2, "critical": 3}

SCHEMA = """
CREATE TABLE IF NOT EXISTS notification_log (
    dataset_id  TEXT NOT NULL,
    location_id TEXT NOT NULL,
    series_id   TEXT NOT NULL,
    risk        TEXT NOT NULL,
    sent_at     TEXT NOT NULL,
    PRIMARY KEY (dataset_id, location_id, series_id)
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init() -> None:
    with db.connect() as conn:
        conn.executescript(SCHEMA)


# ------------------------------------------------------------------ channels

class Channel:
    name = "base"

    def configured(self) -> bool:
        raise NotImplementedError

    def send(self, recipients: list[str], subject: str, body: str) -> dict:
        raise NotImplementedError


class EmailChannel(Channel):
    """SMTP from the standard library. No new dependency to install."""

    name = "email"

    def configured(self) -> bool:
        return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))

    def send(self, recipients: list[str], subject: str, body: str) -> dict:
        if not self.configured():
            return {
                "sent": False,
                "reason": "SMTP_HOST / SMTP_FROM not set — returning the message instead",
            }

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = os.environ["SMTP_FROM"]
        message["To"] = ", ".join(recipients)
        message.set_content(body)

        try:
            port = int(os.getenv("SMTP_PORT", "587"))
            with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=15) as smtp:
                if os.getenv("SMTP_STARTTLS", "1") not in ("0", "false", "no"):
                    smtp.starttls()
                user, password = os.getenv("SMTP_USER"), os.getenv("SMTP_PASSWORD")
                if user and password:
                    smtp.login(user, password)
                smtp.send_message(message)
            return {"sent": True}
        except Exception as exc:  # noqa: BLE001 — a failed notification must not break a run
            log.warning("email send failed: %s", exc)
            return {"sent": False, "reason": f"{type(exc).__name__}: {exc}"}


class WhatsAppChannel(Channel):
    """Placeholder that is honest about being one.

    Kept as a real class so the adapter slot exists and the pitch is literally
    true — "same code, different adapter" — without pretending it sends.
    """

    name = "whatsapp"

    def configured(self) -> bool:
        return False

    def send(self, recipients: list[str], subject: str, body: str) -> dict:
        return {
            "sent": False,
            "reason": "WhatsApp Business API requires Meta verification; adapter not yet connected",
        }


CHANNELS: dict[str, Channel] = {
    "email": EmailChannel(),
    "whatsapp": WhatsAppChannel(),
}


# ------------------------------------------------------------------ dedupe

def _already_sent(dataset_id: str, location_id: str) -> dict[str, str]:
    return {
        r["series_id"]: r["risk"]
        for r in db.query(
            "SELECT series_id, risk FROM notification_log WHERE dataset_id = ? AND location_id = ?",
            (dataset_id, location_id),
        )
    }


def filter_new(
    dataset_id: str, location_id: str, rows: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Split into (worth sending, already reported at this risk or worse)."""
    sent = _already_sent(dataset_id, location_id)
    fresh, repeat = [], []
    for row in rows:
        previous = sent.get(row["series_id"])
        if previous is None or RISK_SEVERITY.get(row["risk"], 0) > RISK_SEVERITY.get(previous, 0):
            fresh.append(row)
        else:
            repeat.append(row)
    return fresh, repeat


def record_sent(dataset_id: str, location_id: str, rows: list[dict]) -> None:
    db.execute_many(
        """INSERT OR REPLACE INTO notification_log
           (dataset_id, location_id, series_id, risk, sent_at) VALUES (?,?,?,?,?)""",
        [(dataset_id, location_id, r["series_id"], r["risk"], _now()) for r in rows],
    )


def reset(dataset_id: str, location_id: str | None = None) -> int:
    """Forget what was sent, so the next digest reports everything again."""
    if location_id:
        db.execute(
            "DELETE FROM notification_log WHERE dataset_id = ? AND location_id = ?",
            (dataset_id, location_id),
        )
    else:
        db.execute("DELETE FROM notification_log WHERE dataset_id = ?", (dataset_id,))
    return 1


# ------------------------------------------------------------------ digest

def send_branch_digest(
    dataset_id: str,
    location_id: str,
    recipients: list[str],
    channel: str = "email",
    dry_run: bool = False,
) -> dict:
    """Build and send one branch's digest, applying all three anti-spam rules."""
    from ..services import branches, view_models as views

    init()
    adapter = CHANNELS.get(channel)
    if adapter is None:
        raise ValueError(f"unknown channel '{channel}'. Available: {', '.join(CHANNELS)}")

    rows = [
        r for r in views._enriched_rows(dataset_id)
        if r["location_id"] == location_id and r["risk"] in views.ATTENTION
    ]
    fresh, repeat = filter_new(dataset_id, location_id, rows)

    summary = branches.branch_summary(dataset_id, location_id)
    inbound = [t for t in branches.insights(dataset_id, location_id)["transfers"]
               if t["to_location"] == location_id]

    # Rule 2: nothing new to act on means no message at all.
    if not fresh and not inbound:
        return {
            "sent": False,
            "skipped": True,
            "reason": (
                f"nothing new — {len(repeat)} item(s) already reported at this risk"
                if repeat else "no items need action"
            ),
            "location_id": location_id,
            "new_items": 0,
            "repeat_items": len(repeat),
        }

    date = datetime.now(timezone.utc).strftime("%d %B %Y")
    subject = f"Cabang {location_id} — {len(fresh)} barang perlu tindakan ({date})"
    body = f"Cabang {location_id} — {date}\n\n{summary['text']}\n"

    result = {
        "location_id": location_id,
        "channel": channel,
        "recipients": recipients,
        "subject": subject,
        "body": body,
        "new_items": len(fresh),
        "repeat_items": len(repeat),
        "dry_run": dry_run,
    }

    if dry_run or not recipients:
        result.update({
            "sent": False,
            "reason": "dry run" if dry_run else "no recipients supplied",
        })
        return result

    outcome = adapter.send(recipients, subject, body)
    result.update(outcome)

    # Rule 3: only remember items once they actually went out, so a failed send
    # is retried next time rather than silently swallowed.
    if outcome.get("sent"):
        record_sent(dataset_id, location_id, fresh)
    return result
