"""Data health as a deliverable, not a score.

A number alone tells a mid-market ops lead nothing. The report must end with
which series cannot be forecast and what to fix.
"""

from __future__ import annotations

import polars as pl

from ..canonical import SERIES_ID, TARGET, TIMESTAMP, Frequency
from .pipeline import CleaningReport

# A series needs enough history for two backtest windows plus a horizon.
MIN_OBS = {Frequency.DAILY: 60, Frequency.WEEKLY: 26, Frequency.MONTHLY: 18}
MAX_ZERO_RATIO = 0.95


def assess_series(
    df: pl.DataFrame, frequency: Frequency
) -> tuple[list[str], list[dict]]:
    """Split series into forecastable and excluded-with-a-reason."""
    min_obs = MIN_OBS[frequency]
    stats = df.group_by(SERIES_ID).agg(
        pl.len().alias("n_obs"),
        (pl.col(TARGET) > 0).sum().alias("n_nonzero"),
        pl.col(TARGET).sum().alias("total"),
    )

    forecastable: list[str] = []
    excluded: list[dict] = []
    for row in stats.iter_rows(named=True):
        series_id = row[SERIES_ID]
        n_obs, n_nonzero, total = row["n_obs"], row["n_nonzero"], row["total"]

        if n_obs < min_obs:
            excluded.append({
                "series_id": series_id,
                "reason": f"only {n_obs} periods of history, need {min_obs}",
                "fix": "export a longer date range for this item",
            })
        elif total <= 0:
            excluded.append({
                "series_id": series_id,
                "reason": "no demand recorded in the whole period",
                "fix": "confirm this item is still active",
            })
        elif n_nonzero / n_obs < (1 - MAX_ZERO_RATIO):
            excluded.append({
                "series_id": series_id,
                "reason": f"demand in only {n_nonzero} of {n_obs} periods",
                "fix": "forecast this item at a coarser frequency, or order to policy",
            })
        else:
            forecastable.append(series_id)

    return forecastable, excluded


def health_score(report: CleaningReport, n_forecastable: int, n_total: int) -> int:
    """0-100. Deliberately generous on volume, strict on structure."""
    if n_total == 0:
        return 0
    score = 100.0

    rows = max(report.rows_received, 1)
    score -= min(15.0, (report.duplicates_found / rows) * 100 * 1.5)
    score -= min(15.0, (report.missing_timestamps / rows) * 100 * 0.8)
    score -= min(10.0, (report.unparseable_timestamps / rows) * 100 * 2.0)
    score -= min(10.0, (report.negative_values / rows) * 100 * 1.0)

    coverage = n_forecastable / n_total
    score -= (1 - coverage) * 30.0

    return max(0, min(100, round(score)))


def build_report(
    df: pl.DataFrame,
    cleaning: CleaningReport,
    frequency: Frequency,
) -> dict:
    forecastable, excluded = assess_series(df, frequency)
    n_total = cleaning.series_total or df.get_column(SERIES_ID).n_unique()
    score = health_score(cleaning, len(forecastable), n_total)

    timestamps = df.get_column(TIMESTAMP)
    span_start = timestamps.min()
    span_end = timestamps.max()
    n_periods = int(timestamps.n_unique())

    findings: list[dict] = []
    if cleaning.duplicates_found:
        findings.append({
            "level": "warn",
            "text": f"{cleaning.duplicates_found} duplicate rows aggregated",
        })
    if cleaning.missing_timestamps:
        findings.append({
            "level": "warn",
            "text": f"{cleaning.missing_timestamps} missing periods filled with zero demand",
        })
    if cleaning.negative_values:
        findings.append({
            "level": "warn",
            "text": f"{cleaning.negative_values} negative rows treated as returns",
        })
    if cleaning.unparseable_timestamps:
        findings.append({
            "level": "error",
            "text": f"{cleaning.unparseable_timestamps} rows had an unreadable date and were dropped",
        })
    if excluded:
        findings.append({
            "level": "warn",
            "text": f"{len(excluded)} series cannot be forecast yet",
        })
    findings.insert(0, {
        "level": "ok",
        "text": f"{frequency.value} frequency detected across {n_periods} periods",
    })
    findings.insert(1, {
        "level": "ok",
        "text": f"{len(forecastable)} of {n_total} series ready to forecast",
    })

    return {
        "health_score": score,
        "frequency": frequency.value,
        "history_start": str(span_start) if span_start is not None else None,
        "history_end": str(span_end) if span_end is not None else None,
        "periods": n_periods,
        "series_total": n_total,
        "series_forecastable": len(forecastable),
        "series_excluded": excluded[:50],
        "series_excluded_count": len(excluded),
        "findings": findings,
        "cleaning": cleaning.as_dict(),
        "forecastable_ids": forecastable,
    }
