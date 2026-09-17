"""Sampled backtest, for demos and for datasets too large to validate in full.

The backtest is the expensive part of a run: every candidate model, every fold,
every series, with the foundation models behind HTTP. On the 599-series VN2
dataset that is thousands of round trips, and on stage it is the thing that
makes a demo wait.

This runs the **same** backtest on a representative sample and extrapolates the
segment result to the rest. It does not invent numbers. What comes out is:

    measured    the sampled series — real folds, real metrics
    estimated   the rest — their own demand class's sampled means

That distinction is carried all the way to the API, because a fabricated WAPE
that reaches a pitch slide is worse than a slow demo. Estimated series say so
in their selection reason, and the run records how many of each there were.

**Why extrapolating by segment is sound here rather than a fudge.** Selection
already works this way. With two validation windows the rule in `backtest.py`
refuses per-series choices and applies the demand-class default to everything —
on VN2 that was 599 of 599 series. So a sampled run reaches the *same decision*
a full run would; what is lost is the per-series metric display, not the choice
of model. If that rule ever changes, this module's claim weakens with it, and
the sample size has to grow to match.

**The one thing that cannot be copied between series.** RMSE is in units, and
safety stock is sized on it. A series selling 3 units a week and one selling
3,000 have nothing to say to each other in absolute error. So RMSE travels as a
ratio to the donor's own mean demand and is re-scaled to each target series.
Copy it raw and every slow mover gets a buffer sized for a fast one.
"""

from __future__ import annotations

import logging
import os

import numpy as np

from ..canonical import DemandClass
from .backtest import N_WINDOWS, SeriesEvaluation, evaluate_batched
from .metrics import primary_metric

log = logging.getLogger(__name__)

# Per demand class, not overall: the classes are wildly unequal in size (VN2 is
# 320 intermittent against 36 erratic) and a flat sample would leave the small
# classes represented by one or two series.
SAMPLE_PER_CLASS = 6

# Metrics that mean the same thing at any volume, so they can be carried across
# series unchanged. RMSE is deliberately absent — see the module docstring.
SCALE_FREE = ("wape", "mase", "bias")

# Bias averages toward zero and is signed, so an empty sample means "no known
# bias", not "infinitely biased".
_EMPTY = {"wape": float("inf"), "mase": float("inf"), "bias": 0.0, "rmse_ratio": float("inf")}


def mock_enabled() -> bool:
    """Read at call time, not import time, so a test or a request can flip it."""
    return os.getenv("MOCK_MODE", "").strip().lower() in ("1", "true", "yes", "on")


def _mean_demand(history: np.ndarray | None) -> float:
    if history is None or history.size == 0:
        return 0.0
    mean = float(np.nanmean(history))
    return mean if np.isfinite(mean) and mean > 0 else 0.0


def _representatives(
    series_ids: list[str],
    histories: dict[str, np.ndarray],
    profiles: dict,
    per_class: int,
) -> tuple[dict[DemandClass, list[str]], dict[DemandClass, list[str]]]:
    """Pick the series to actually backtest, grouped by demand class.

    Sorted by volume and then sampled at even intervals, so the sample spans
    slow and fast movers rather than whichever ids happen to sort first. A
    sample of only fast movers would report an optimistic WAPE and an RMSE
    ratio that is wrong for most of the catalogue.

    Deterministic on purpose. A demo re-run must not produce new numbers, and a
    random sample would mean the figure on the slide changes between rehearsal
    and stage.
    """
    by_class: dict[DemandClass, list[str]] = {}
    for series_id in series_ids:
        profile = profiles.get(series_id)
        if profile is None:
            continue
        by_class.setdefault(profile.demand_class, []).append(series_id)

    chosen: dict[DemandClass, list[str]] = {}
    for demand_class, members in by_class.items():
        ranked = sorted(members, key=lambda s: (_mean_demand(histories.get(s)), s))
        take = min(per_class, len(ranked))
        if take == 0:
            continue
        stride = len(ranked) / take
        picked: list[str] = []
        for i in range(take):
            index = min(len(ranked) - 1, int(i * stride + stride / 2))
            if ranked[index] not in picked:
                picked.append(ranked[index])
        chosen[demand_class] = picked
    return by_class, chosen


def _class_template(
    evaluations: list[SeriesEvaluation], histories: dict[str, np.ndarray]
) -> dict[str, dict[str, float]]:
    """Per model, what this demand class scored across the sampled series."""
    gathered: dict[str, dict[str, list[float]]] = {}

    for evaluation in evaluations:
        mean_demand = _mean_demand(histories.get(evaluation.series_id))
        for model_name, folds in evaluation.folds.items():
            bucket = gathered.setdefault(
                model_name, {key: [] for key in (*SCALE_FREE, "rmse_ratio")}
            )
            for fold in folds:
                for key in SCALE_FREE:
                    value = fold.get(key)
                    if value is not None and np.isfinite(value):
                        bucket[key].append(float(value))
                error = fold.get("rmse")
                if error is not None and np.isfinite(error) and mean_demand > 0:
                    bucket["rmse_ratio"].append(float(error) / mean_demand)

    template: dict[str, dict[str, float]] = {}
    for model_name, bucket in gathered.items():
        # A model that scored nothing usable is not a candidate to extrapolate.
        if not bucket["wape"] and not bucket["mase"]:
            continue
        template[model_name] = {
            key: float(np.mean(values)) if values else _EMPTY[key]
            for key, values in bucket.items()
        }
    return template


def _synthesise(
    series_id: str,
    demand_class: DemandClass,
    template: dict[str, dict[str, float]],
    history: np.ndarray | None,
) -> SeriesEvaluation:
    """An evaluation shaped exactly like a measured one, from class means.

    N_WINDOWS identical folds rather than one: `select_model` reads
    `n_validation_points` to decide whether a per-series choice is allowed, and
    an estimated evaluation must land on the same side of that rule as the
    measured run it stands in for. One fold would push it to the
    "no validation possible" branch and change the reason text for no reason.
    """
    mean_demand = _mean_demand(history)
    evaluation = SeriesEvaluation(series_id=series_id, demand_class=demand_class)
    metric = primary_metric(demand_class)

    for model_name, stats in template.items():
        ratio = stats["rmse_ratio"]
        fold = {
            "wape": round(stats["wape"], 4) if np.isfinite(stats["wape"]) else float("inf"),
            "mase": round(stats["mase"], 4) if np.isfinite(stats["mase"]) else float("inf"),
            "bias": round(stats["bias"], 4),
            # Re-scaled to this series' own volume. Safety stock depends on it.
            "rmse": round(ratio * mean_demand, 4) if np.isfinite(ratio) else float("inf"),
            "primary": metric,
        }
        evaluation.folds[model_name] = [dict(fold) for _ in range(N_WINDOWS)]

    return evaluation


def evaluate_sampled(
    series_ids: list[str],
    histories: dict[str, np.ndarray],
    profiles: dict,
    candidates_for,
    seasonal_period: int,
    horizon_for,
    covariates: dict[str, dict] | None = None,
    progress=None,
    per_class: int = SAMPLE_PER_CLASS,
) -> tuple[list[SeriesEvaluation], dict]:
    """Backtest a representative sample; estimate the rest from their segment.

    Returns the evaluations in the order `series_ids` gave them, plus a report
    of what was measured against what was estimated. The caller is expected to
    carry that report into the selection reason and the job record — this
    function deliberately does not hide the distinction.
    """
    by_class, chosen = _representatives(series_ids, histories, profiles, per_class)
    sample = [series_id for picks in chosen.values() for series_id in picks]

    if not sample:
        return [], {
            "mode": "sampled",
            "sampled": 0,
            "estimated": 0,
            "total": len(series_ids),
            "estimated_series": set(),
            "per_class": {},
        }

    measured = evaluate_batched(
        sample,
        histories,
        profiles,
        candidates_for,
        seasonal_period=seasonal_period,
        horizon_for=horizon_for,
        covariates=covariates,
        progress=progress,
    )
    measured_by_id = {evaluation.series_id: evaluation for evaluation in measured}

    templates = {
        demand_class: _class_template(
            [measured_by_id[s] for s in picks if s in measured_by_id], histories
        )
        for demand_class, picks in chosen.items()
    }

    evaluations: list[SeriesEvaluation] = []
    estimated_series: set[str] = set()
    unusable = 0

    for series_id in series_ids:
        if series_id in measured_by_id:
            evaluations.append(measured_by_id[series_id])
            continue

        profile = profiles.get(series_id)
        if profile is None:
            continue

        template = templates.get(profile.demand_class)
        if not template:
            # Nothing measured for this class. An empty evaluation is honest —
            # `select_model` falls back to seasonal naive and says so.
            evaluations.append(
                SeriesEvaluation(series_id=series_id, demand_class=profile.demand_class)
            )
            unusable += 1
            continue

        evaluations.append(
            _synthesise(series_id, profile.demand_class, template, histories.get(series_id))
        )
        estimated_series.add(series_id)

    report = {
        "mode": "sampled",
        "sampled": len(measured_by_id),
        "estimated": len(estimated_series),
        "total": len(series_ids),
        "unusable": unusable,
        "estimated_series": estimated_series,
        "per_class": {
            demand_class.value: {
                "series": len(by_class.get(demand_class, [])),
                "sampled": len(picks),
                "models": sorted(templates.get(demand_class, {})),
            }
            for demand_class, picks in chosen.items()
        },
    }
    log.info(
        "sampled backtest: measured %d of %d series, estimated %d",
        report["sampled"],
        report["total"],
        report["estimated"],
    )
    return evaluations, report
