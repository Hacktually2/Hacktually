"""Wide-to-long reshaping.

Some of the most common real exports run time sideways: one row per item, one
column per date. Excel pivot tables do it, Bank Indonesia's PIHPS export does it,
and the VN2 planning dataset does it:

    Store,Product,2021-04-12,2021-04-19,2021-04-26,...
    0,126,0.0,0.0,3.0,...

A pipeline that only reads long format does not merely handle this badly — it
cannot see a timestamp or a target at all, so it correctly refuses the file and
the user concludes the product does not work. Detecting the shape and unpivoting
turns a hard refusal into an ordinary dataset.

Detection is on the column NAMES, not the values: a header that parses as a date
is a date, and there is no other sensible reason for a column to be called
`2021-04-12`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import polars as pl

# Header patterns worth trying, in order. Kept strict on purpose — a loose
# matcher would treat an ID column like `20240415` as a date.
DATE_HEADER_FORMATS = (
    ("%Y-%m-%d", re.compile(r"^\d{4}-\d{1,2}-\d{1,2}$")),
    ("%d/%m/%Y", re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")),
    ("%m/%d/%Y", re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")),
    ("%Y/%m/%d", re.compile(r"^\d{4}/\d{1,2}/\d{1,2}$")),
    ("%d-%m-%Y", re.compile(r"^\d{1,2}-\d{1,2}-\d{4}$")),
    ("%b %Y", re.compile(r"^[A-Za-z]{3} \d{4}$")),
    ("%Y-%m", re.compile(r"^\d{4}-\d{1,2}$")),
)

MIN_DATE_COLUMNS = 3
MIN_DATE_SHARE = 0.5

TIMESTAMP_COL = "__period__"
VALUE_COL = "__value__"


@dataclass
class WideInfo:
    """What the reshape did, so the mapper can be told rather than guess."""

    date_columns: int
    id_columns: list[str]
    format_used: str
    first_period: str
    last_period: str

    def as_dict(self) -> dict:
        return {
            "reshaped": True,
            "date_columns": self.date_columns,
            "id_columns": self.id_columns,
            "format_used": self.format_used,
            "span": f"{self.first_period} .. {self.last_period}",
        }


def _parse_header(name: str) -> tuple[str, str] | None:
    """Return (format, normalized ISO date) if this header is a date."""
    from datetime import datetime

    text = name.strip()
    for fmt, pattern in DATE_HEADER_FORMATS:
        if not pattern.match(text):
            continue
        try:
            parsed = datetime.strptime(text, fmt)
        except ValueError:
            continue
        # A two-digit first field is ambiguous between d/m and m/d. Prefer the
        # day-first reading, which is what Indonesian exports use.
        return fmt, parsed.date().isoformat()
    return None


def detect(columns: list[str]) -> tuple[list[str], list[str], str] | None:
    """(date_columns, id_columns, format) when the frame runs time sideways."""
    date_columns: list[str] = []
    formats: list[str] = []

    for name in columns:
        parsed = _parse_header(name)
        if parsed:
            date_columns.append(name)
            formats.append(parsed[0])

    if len(date_columns) < MIN_DATE_COLUMNS:
        return None
    if len(date_columns) / max(len(columns), 1) < MIN_DATE_SHARE:
        return None

    id_columns = [c for c in columns if c not in set(date_columns)]
    dominant = max(set(formats), key=formats.count)
    return date_columns, id_columns, dominant


def reshape(df: pl.DataFrame) -> tuple[pl.DataFrame, WideInfo | None]:
    """Unpivot a wide frame into long form. Returns the frame unchanged if not wide."""
    found = detect(df.columns)
    if not found:
        return df, None

    date_columns, id_columns, fmt = found

    long = df.unpivot(
        index=id_columns,
        on=date_columns,
        variable_name=TIMESTAMP_COL,
        value_name=VALUE_COL,
    )

    # Normalise the header text to ISO so the downstream date parser has one
    # unambiguous format rather than whatever the spreadsheet happened to use.
    mapping = {}
    for name in date_columns:
        parsed = _parse_header(name)
        if parsed:
            mapping[name] = parsed[1]

    long = long.with_columns(
        pl.col(TIMESTAMP_COL).replace_strict(mapping, default=None)
    )

    # A wide grid is dense by construction: every item gets every column, so
    # blanks are genuinely absent observations rather than zeros.
    long = long.filter(pl.col(TIMESTAMP_COL).is_not_null())
    long = long.with_columns(pl.col(VALUE_COL).cast(pl.Float64, strict=False))
    long = long.filter(pl.col(VALUE_COL).is_not_null())

    periods = sorted(mapping.values())
    info = WideInfo(
        date_columns=len(date_columns),
        id_columns=id_columns,
        format_used=fmt,
        first_period=periods[0] if periods else "",
        last_period=periods[-1] if periods else "",
    )
    return long, info


def forced_mapping() -> dict[str, str]:
    """The two fields reshaping creates, which the mapper must not have to infer."""
    from ..canonical import TARGET, TIMESTAMP

    return {TIMESTAMP: TIMESTAMP_COL, TARGET: VALUE_COL}
