"""Canonicalization and cleaning. Deterministic — AI understands semantics, code cleans data.

Four transforms only. Everything else is a flag in the health report, not a mutation.
"""

from __future__ import annotations

from collections import Counter

import polars as pl

from ..canonical import (
    ALL_FIELDS,
    Frequency,
    INVENTORY,
    ITEM_ID,
    LOCATION_ID,
    SERIES_ID,
    SchemaMapping,
    TARGET,
    TIMESTAMP,
    build_series_id,
)

DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%m/%d/%Y",
    "%d/%m/%y",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y %H:%M",
)


class CleaningReport:
    """Everything the pipeline changed or noticed, in one place."""

    def __init__(self) -> None:
        self.rows_received = 0
        self.rows_after_clean = 0
        self.duplicates_found = 0
        self.missing_timestamps = 0
        self.unparseable_timestamps = 0
        self.negative_values = 0
        self.null_targets = 0
        self.reindexed_gaps = 0
        self.frequency: str = "daily"
        self.series_total = 0
        self.notes: list[str] = []

    def as_dict(self) -> dict:
        return {
            "rows_received": self.rows_received,
            "rows_after_clean": self.rows_after_clean,
            "duplicates_found": self.duplicates_found,
            "missing_timestamps": self.missing_timestamps,
            "unparseable_timestamps": self.unparseable_timestamps,
            "negative_values": self.negative_values,
            "null_targets": self.null_targets,
            "reindexed_gaps": self.reindexed_gaps,
            "frequency": self.frequency,
            "series_total": self.series_total,
            "notes": self.notes,
        }


def _parse_timestamp(df: pl.DataFrame, column: str) -> pl.DataFrame:
    """Try formats in order, keep the one that parses the most rows."""
    series = df.get_column(column)
    if series.dtype.is_temporal():
        return df.with_columns(pl.col(column).cast(pl.Datetime).alias(TIMESTAMP))

    as_str = series.cast(pl.Utf8, strict=False)
    best_parsed, best_count = None, -1
    for fmt in DATE_FORMATS:
        parsed = as_str.str.to_datetime(format=fmt, strict=False)
        count = parsed.drop_nulls().len()
        if count > best_count:
            best_parsed, best_count = parsed, count

    if best_parsed is None or best_count == 0:
        # Last resort: let polars infer per value.
        best_parsed = as_str.str.to_datetime(strict=False)

    return df.with_columns(best_parsed.alias(TIMESTAMP))


def detect_frequency(timestamps: pl.Series) -> Frequency:
    """Modal gap between consecutive distinct dates."""
    distinct = timestamps.drop_nulls().unique().sort()
    if distinct.len() < 3:
        return Frequency.DAILY
    days = distinct.diff().drop_nulls().dt.total_days().to_list()
    gaps = [d for d in days if d and d > 0]
    if not gaps:
        return Frequency.DAILY
    modal = Counter(gaps).most_common(1)[0][0]
    if modal >= 28:
        return Frequency.MONTHLY
    if modal >= 5:
        return Frequency.WEEKLY
    return Frequency.DAILY


def canonicalize(
    df: pl.DataFrame, mapping: SchemaMapping
) -> tuple[pl.DataFrame, CleaningReport]:
    """Raw dataframe + mapping -> canonical frame. Transforms 1 and 3."""
    report = CleaningReport()
    report.rows_received = df.height

    missing = mapping.missing_required()
    if missing:
        raise ValueError(f"cannot canonicalize without: {', '.join(missing)}")

    ts_col = mapping.get(TIMESTAMP)
    target_col = mapping.get(TARGET)

    df = _parse_timestamp(df, ts_col)
    report.unparseable_timestamps = int(df.get_column(TIMESTAMP).null_count())

    df = df.with_columns(
        pl.col(target_col).cast(pl.Float64, strict=False).alias(TARGET)
    )
    report.null_targets = int(
        df.get_column(TARGET).null_count() - report.unparseable_timestamps
        if df.get_column(TARGET).null_count() > report.unparseable_timestamps
        else df.get_column(TARGET).null_count()
    )

    # Carry through whichever optional fields were mapped.
    carried: list[pl.Expr] = []
    for canonical in ALL_FIELDS:
        if canonical in (TIMESTAMP, TARGET):
            continue
        source = mapping.get(canonical)
        if not source or source not in df.columns:
            continue
        if canonical in (ITEM_ID, LOCATION_ID):
            carried.append(pl.col(source).cast(pl.Utf8, strict=False).alias(canonical))
        else:
            carried.append(
                pl.col(source).cast(pl.Float64, strict=False).alias(canonical)
                if canonical not in ("category",)
                else pl.col(source).cast(pl.Utf8, strict=False).alias(canonical)
            )
    if carried:
        df = df.with_columns(carried)

    # Build series_id.
    has_item = ITEM_ID in df.columns
    has_location = LOCATION_ID in df.columns
    if has_item and has_location:
        df = df.with_columns(
            (
                pl.col(ITEM_ID).fill_null("")
                + pl.lit("__")
                + pl.col(LOCATION_ID).fill_null("")
            ).alias(SERIES_ID)
        )
    elif has_item:
        df = df.with_columns(pl.col(ITEM_ID).fill_null("ALL").alias(SERIES_ID))
    else:
        df = df.with_columns(pl.lit("ALL").alias(SERIES_ID))

    keep = [c for c in (TIMESTAMP, SERIES_ID, TARGET, *ALL_FIELDS) if c in df.columns]
    df = df.select(list(dict.fromkeys(keep)))  # dedupe, preserve order

    # Drop rows we cannot use at all.
    df = df.filter(pl.col(TIMESTAMP).is_not_null() & pl.col(TARGET).is_not_null())

    # Transform 3: negatives are returns, not demand.
    negatives = int(df.filter(pl.col(TARGET) < 0).height)
    report.negative_values = negatives
    if negatives:
        df = df.filter(pl.col(TARGET) >= 0)
        report.notes.append(
            f"{negatives} negative rows treated as returns and excluded from fitting"
        )

    return df, report


def clean(
    df: pl.DataFrame, report: CleaningReport
) -> tuple[pl.DataFrame, CleaningReport]:
    """Transforms 1, 2 and 4: dedupe, detect frequency, reindex the time axis."""
    if df.height == 0:
        report.rows_after_clean = 0
        return df, report

    frequency = detect_frequency(df.get_column(TIMESTAMP))
    report.frequency = frequency.value

    # Transform 4: snap to the frequency grid before deduping.
    df = df.with_columns(
        pl.col(TIMESTAMP).dt.truncate(frequency.polars_every).alias(TIMESTAMP)
    )

    # Transform 1: aggregate duplicate (timestamp, series_id) rows.
    before = df.height
    agg_exprs = [pl.col(TARGET).sum().alias(TARGET)]
    for column in df.columns:
        if column in (TIMESTAMP, SERIES_ID, TARGET):
            continue
        if df.schema[column] == pl.Utf8:
            agg_exprs.append(pl.col(column).first().alias(column))
        else:
            agg_exprs.append(pl.col(column).mean().alias(column))

    df = (
        df.group_by([SERIES_ID, TIMESTAMP])
        .agg(agg_exprs)
        .sort([SERIES_ID, TIMESTAMP])
    )
    report.duplicates_found = before - df.height

    # Transform 2: reindex each series onto a complete time axis.
    df, gaps = _reindex(df, frequency)
    report.reindexed_gaps = gaps
    report.missing_timestamps = gaps
    report.series_total = int(df.get_column(SERIES_ID).n_unique())
    report.rows_after_clean = df.height
    return df, report


def _reindex(df: pl.DataFrame, frequency: Frequency) -> tuple[pl.DataFrame, int]:
    """Fill gaps per series. Missing demand in a complete calendar is zero demand."""
    before = df.height
    filled = (
        df.sort([SERIES_ID, TIMESTAMP])
        .upsample(
            time_column=TIMESTAMP,
            every=frequency.polars_every,
            group_by=SERIES_ID,
            maintain_order=True,
        )
    )
    filled = filled.with_columns(
        pl.col(SERIES_ID).forward_fill(),
        pl.col(TARGET).fill_null(0.0),
    )
    # Carried attributes are properties of the series, not the row.
    for column in filled.columns:
        if column in (TIMESTAMP, SERIES_ID, TARGET):
            continue
        filled = filled.with_columns(
            pl.col(column).forward_fill().over(SERIES_ID).alias(column)
        )
    return filled, filled.height - before
