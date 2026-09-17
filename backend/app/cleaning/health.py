"""Data health as a deliverable, not a score.

A number alone tells a mid-market ops lead nothing. The report must end with
which series cannot be forecast and what to fix.
"""

from __future__ import annotations

import polars as pl

from ..canonical import SERIES_ID, TARGET, TIMESTAMP, Frequency
from . import lifecycle
from ..enrich import censoring as censoring_mod
from .pipeline import CleaningReport

# A series needs enough history for two backtest windows plus a horizon.
MIN_OBS = {Frequency.DAILY: 60, Frequency.WEEKLY: 26, Frequency.MONTHLY: 18}
MAX_ZERO_RATIO = 0.95



def assess_series(
    df: pl.DataFrame,
    frequency: Frequency,
    adi_by_series: dict[str, float] | None = None,
) -> tuple[list[str], list[dict], dict]:
    """Split series by lifecycle state, not by row count.

    Returns (forecastable_ids, excluded, lifecycle_detail). Seasonal and slow
    items stay forecastable on purpose — a Lebaran-only SKU is quiet for nine
    months and is precisely the item worth forecasting.
    """
    min_obs = MIN_OBS[frequency]
    verdicts = lifecycle.classify_all(df, frequency, adi_by_series, min_obs)

    forecastable: list[str] = []
    excluded: list[dict] = []

    for series_id, verdict in verdicts.items():
        if verdict.state.forecastable:
            forecastable.append(series_id)
        else:
            excluded.append({
                "series_id": series_id,
                "state": verdict.state.value,
                "reason": verdict.reason,
                "fix": verdict.fix,
            })

    # Sparsity is orthogonal to lifecycle: an item can be alive and still be too
    # sparse to forecast at this frequency.
    sparse_cut = 1 - MAX_ZERO_RATIO
    stats = df.group_by(SERIES_ID).agg(
        pl.len().alias("n_obs"),
        (pl.col(TARGET) > 0).sum().alias("n_nonzero"),
    )
    sparse = {
        r[SERIES_ID]: (r["n_obs"], r["n_nonzero"])
        for r in stats.iter_rows(named=True)
        if r["n_obs"] and r["n_nonzero"] / r["n_obs"] < sparse_cut
    }
    if sparse:
        still_ok = []
        for series_id in forecastable:
            if series_id in sparse:
                n_obs, n_nonzero = sparse[series_id]
                excluded.append({
                    "series_id": series_id,
                    "state": "too_sparse",
                    "reason": f"demand in only {n_nonzero} of {n_obs} periods",
                    "fix": "forecast at a coarser frequency, or order to policy",
                })
            else:
                still_ok.append(series_id)
        forecastable = still_ok

    detail = {
        "states": lifecycle.summary(verdicts),
        "dead_stock": lifecycle.dead_stock(df, verdicts),
        "censoring": censoring_mod.method_for(df),
    }
    return forecastable, excluded, detail


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
    adi_by_series: dict[str, float] | None = None,
) -> dict:
    forecastable, excluded, lifecycle_detail = assess_series(df, frequency, adi_by_series)
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
    states = lifecycle_detail["states"]
    if states.get("seasonal_dormant"):
        findings.append({
            "level": "ok",
            "text": (
                f"{states['seasonal_dormant']} series are seasonally dormant, not dead — "
                "kept in the forecast"
            ),
        })
    if states.get("slow_mover"):
        findings.append({
            "level": "ok",
            "text": f"{states['slow_mover']} slow movers kept, judged against their own rhythm",
        })
    if states.get("discontinued"):
        findings.append({
            "level": "warn",
            "text": f"{states['discontinued']} series look discontinued and were excluded",
        })
    if states.get("at_risk"):
        findings.append({
            "level": "warn",
            "text": f"{states['at_risk']} series are quiet longer than expected — low confidence",
        })

    censoring_info = lifecycle_detail["censoring"]
    if censoring_info["method"] == "inferred":
        findings.append({
            "level": "warn",
            "text": (
                "no stock column — stockouts are inferred conservatively and most "
                "are missed. Send stock levels to measure true demand."
            ),
        })

    dead = lifecycle_detail["dead_stock"]
    if dead["count"]:
        if dead["valued"]:
            findings.append({
                "level": "warn",
                "text": (
                    f"{dead['count']} dormant items still hold stock worth "
                    f"Rp {dead['total_value']:,.0f}"
                ),
            })
        else:
            findings.append({
                "level": "warn",
                "text": f"{dead['count']} dormant items still hold {dead['total_units']:,.0f} units",
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
        "lifecycle": lifecycle_detail["states"],
        "censoring": lifecycle_detail["censoring"],
        "dead_stock": lifecycle_detail["dead_stock"],
        "forecastable_ids": forecastable,
    }
