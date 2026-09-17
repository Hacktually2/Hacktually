"""Personal data detection on upload.

A demand forecast needs dates, items, locations and quantities. It does not need
customer names, phone numbers, addresses or national ID numbers — and an export
pulled straight out of an ERP very often carries them anyway, because whoever
ran the report selected every column.

So this looks for personal data and says so. It does not delete anything and it
does not block the upload: which columns a company is allowed to send is their
decision, and silently dropping a column would be worse than flagging it. What
it does is make the choice visible at the one moment it is cheap to make —
before the data is used — and give the reason in plain words.

Detection is on a small sample of values rather than on column names, because
names lie in both directions: `keterangan` can hold phone numbers and `nama`
can hold product names.

Indonesian formats are first-class here: NIK is 16 digits, NPWP 15, phone
numbers start 08 or +62. A detector built only for US formats would find none of
them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .profiler import ColumnProfile

# Each rule: (key, label, why it matters, pattern, how many samples must match)
RULES: tuple[tuple[str, str, str, re.Pattern[str], float], ...] = (
    (
        "email",
        "Email address",
        "Identifies a person directly and is not used by any forecast.",
        re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I),
        0.6,
    ),
    (
        "phone_id",
        "Indonesian phone number",
        "Identifies a person directly and is not used by any forecast.",
        re.compile(r"^(?:\+?62|0)8\d{7,12}$"),
        0.6,
    ),
    (
        "nik",
        "NIK (national ID)",
        "Sixteen-digit national identity number — sensitive personal data.",
        re.compile(r"^\d{16}$"),
        0.8,
    ),
    (
        "npwp",
        "NPWP (tax number)",
        "Fifteen-digit tax number, tied to a person or company.",
        re.compile(r"^\d{15}$|^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$"),
        0.8,
    ),
    (
        "card",
        "Card-like number",
        "Sixteen digits in card format. Never needed for forecasting.",
        re.compile(r"^(?:\d[ -]?){15}\d$"),
        0.8,
    ),
    (
        "coordinates",
        "Precise coordinates",
        "Pinpoints a location more precisely than a branch code needs to.",
        re.compile(r"^-?\d{1,3}\.\d{5,}$"),
        0.8,
    ),
)

# Names alone are weak evidence, so a name match is reported at lower confidence
# and only when the values do not already say what the column is.
NAME_HINTS: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    (
        "person_name",
        "Person's name",
        "Looks like a name column. Forecasting needs the item, not the buyer.",
        ("namapelanggan", "namacustomer", "namasales", "namapembeli", "customername",
         "salesperson", "namakasir", "namapegawai"),
    ),
    (
        "address",
        "Street address",
        "Free-text address. A branch code is enough to forecast by location.",
        ("alamat", "address", "alamatkirim", "shippingaddress"),
    ),
)

SAMPLE_MIN = 2


@dataclass
class Finding:
    column: str
    kind: str
    label: str
    reason: str
    confidence: str          # "high" from values, "low" from the name alone
    matched_samples: int

    def as_dict(self) -> dict:
        return {
            "column": self.column,
            "kind": self.kind,
            "label": self.label,
            "reason": self.reason,
            "confidence": self.confidence,
            "matched_samples": self.matched_samples,
            "recommendation": "Leave this column out of the export, or map it to Ignore.",
        }


def _normalise(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def scan(profiles: list[ColumnProfile], mapped_columns: set[str] | None = None) -> dict:
    """Report personal data found in the sampled values, and in column names.

    `mapped_columns` are the columns a forecast will actually use. A flag on one
    of those is more urgent than a flag on a column nobody reads, so they are
    reported separately.
    """
    mapped_columns = mapped_columns or set()
    findings: list[Finding] = []

    for profile in profiles:
        samples = [s for s in profile.samples if s]
        if not samples:
            continue

        by_values = False
        for kind, label, reason, pattern, threshold in RULES:
            hits = sum(1 for value in samples if pattern.match(value.strip()))
            if hits >= SAMPLE_MIN and hits / len(samples) >= threshold:
                findings.append(
                    Finding(profile.name, kind, label, reason, "high", hits)
                )
                by_values = True
                break

        if by_values:
            continue

        # Only fall back to the name when the values gave nothing, and only for
        # free text — a numeric column called `alamat` is not an address.
        if profile.is_numeric or profile.is_datetime_like:
            continue
        normalised = _normalise(profile.name)
        for kind, label, reason, hints in NAME_HINTS:
            if any(hint in normalised for hint in hints):
                findings.append(Finding(profile.name, kind, label, reason, "low", 0))
                break

    used = [f for f in findings if f.column in mapped_columns]
    return {
        "found": bool(findings),
        "columns": [f.as_dict() for f in findings],
        "in_use": [f.as_dict() for f in used],
        "note": (
            "Personal data is reported, never removed — which columns you send is "
            "your decision. Nothing flagged here is used by the forecast unless it "
            "appears under 'in_use'."
        ),
    }


def as_finding(scan_result: dict) -> dict | None:
    """One health-report finding, phrased for whoever has to act on it."""
    if not scan_result.get("found"):
        return None

    columns = scan_result["columns"]
    in_use = scan_result["in_use"]
    names = ", ".join(c["column"] for c in columns[:4])
    more = f" and {len(columns) - 4} more" if len(columns) > 4 else ""

    if in_use:
        return {
            "id": "personal_data",
            "severity": "critical",
            "title": f"Personal data in a column the forecast uses: {in_use[0]['column']}",
            "detail": (
                f"{len(columns)} column(s) look like personal data ({names}{more}), "
                f"and {len(in_use)} of them feed the forecast. "
                f"{in_use[0]['label']}: {in_use[0]['reason']}"
            ),
            "action": "Map it to Ignore, or re-export without it",
        }

    return {
        "id": "personal_data",
        "severity": "warning",
        "title": f"{len(columns)} column(s) contain personal data",
        "detail": (
            f"{names}{more}. None of them is used by the forecast, but they were "
            "uploaded and are stored with the file."
        ),
        "action": "Re-export without these columns if they are not needed",
    }
