"""Rolling-origin backtest and model selection.

Two windows, not ten. 1,000 series x 4 models x 10 folds is 40,000 runs and no
extra credit.

The leakage rule: a fold's training data is strictly everything before its
validation slice. Covariates for the validation slice are known-future only —
calendar values, never anything derived from the held-out target.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..canonical import DemandClass, SeriesProfile
from ..forecasting.base import ForecastModel
from . import metrics as _metrics
from .metrics import primary_metric, score, tiebreak_metric

N_WINDOWS = 2
MIN_TRAIN = 21


@dataclass
class FoldResult:
    model_name: str
    metrics: dict[str, float]


@dataclass
class SeriesEvaluation:
    series_id: str
    demand_class: DemandClass
    folds: dict[str, list[dict[str, float]]] = field(default_factory=dict)

    def mean_metric(self, model_name: str, metric: str) -> float:
        values = [
            f[metric]
            for f in self.folds.get(model_name, [])
            if np.isfinite(f.get(metric, float("inf")))
        ]
        return float(np.mean(values)) if values else float("inf")

    def spread(self, model_name: str, metric: str) -> float:
        """How much the score moves across folds. Our margin threshold."""
        values = [
            f[metric]
            for f in self.folds.get(model_name, [])
            if np.isfinite(f.get(metric, float("inf")))
        ]
        return float(np.std(values)) if len(values) > 1 else float("inf")

    def mean_bias(self, model_name: str) -> float:
        values = [
            f["bias"]
            for f in self.folds.get(model_name, [])
            if np.isfinite(f.get("bias", float("inf")))
        ]
        return float(np.mean(values)) if values else 0.0

    @property
    def n_validation_points(self) -> int:
        return max((len(v) for v in self.folds.values()), default=0)


def make_windows(n_obs: int, horizon: int, n_windows: int = N_WINDOWS) -> list[tuple[int, int]]:
    """(train_end, validation_end) pairs, earliest first.

    Each window's training set ends exactly where its validation slice begins.
    """
    windows: list[tuple[int, int]] = []
    for i in range(n_windows):
        validation_end = n_obs - i * horizon
        train_end = validation_end - horizon
        if train_end < MIN_TRAIN:
            break
        windows.append((train_end, validation_end))
    return sorted(windows)


def evaluate_series(
    series_id: str,
    values: np.ndarray,
    profile: SeriesProfile,
    models: list[ForecastModel],
    horizon: int,
    seasonal_period: int,
    covariates: dict[str, np.ndarray] | None = None,
) -> SeriesEvaluation:
    """Run every candidate model across every window for one series."""
    evaluation = SeriesEvaluation(series_id=series_id, demand_class=profile.demand_class)
    windows = make_windows(len(values), horizon)
    if not windows:
        return evaluation

    for model in models:
        fold_scores: list[dict[str, float]] = []
        for train_end, validation_end in windows:
            train = values[:train_end]
            actual = values[train_end:validation_end]
            if actual.size == 0:
                continue

            past_cov, future_cov = _slice_covariates(covariates, train_end, validation_end)

            try:
                forecast = model.forecast(
                    train,
                    horizon=actual.size,
                    seasonal_period=seasonal_period,
                    covariates=past_cov,
                    future_covariates=future_cov,
                )
            except Exception:  # noqa: BLE001 — a failed model drops out, it does not stop the run
                continue

            fold_scores.append(
                score(actual, forecast.point[: actual.size], train, profile.demand_class, seasonal_period)
            )

        if fold_scores:
            evaluation.folds[model.name] = fold_scores

    return evaluation


def _slice_covariates(
    covariates: dict[str, np.ndarray] | None, train_end: int, validation_end: int
) -> tuple[dict[str, np.ndarray] | None, dict[str, np.ndarray] | None]:
    """Past covariates end at train_end. Future covariates cover the validation slice only."""
    if not covariates:
        return None, None
    past = {k: v[:train_end] for k, v in covariates.items() if len(v) >= train_end}
    future = {
        k: v[train_end:validation_end]
        for k, v in covariates.items()
        if len(v) >= validation_end
    }
    return past or None, future or None


def rank_candidates(
    scores: dict[str, float], secondary: dict[str, float] | None = None
) -> list[str]:
    """Models best-first on `scores`, with near-ties reordered by `secondary`.

    A tie is relative: everything within TIE_TOLERANCE of the best score. The
    reason for a band rather than exact equality is that the primary metric here
    is a total, and two models whose totals differ by 2% are not meaningfully
    different on the decision — while their timing might be.
    """
    usable = {m: v for m, v in scores.items() if np.isfinite(v)}
    if not usable:
        return list(scores)

    ordered = sorted(usable, key=lambda m: usable[m])
    if secondary is None:
        return ordered

    # Read at call time, not import time, so the tolerance can be swept from a
    # script without re-importing this module.
    tolerance = _metrics.TIE_TOLERANCE
    best = usable[ordered[0]]
    cutoff = best * (1 + tolerance) if best > 0 else tolerance
    tied = [m for m in ordered if usable[m] <= cutoff]
    rest = [m for m in ordered if usable[m] > cutoff]
    tied.sort(key=lambda m: secondary.get(m, float("inf")))
    return tied + rest


def select_model(
    evaluation: SeriesEvaluation,
    segment_default: str | None = None,
    min_points_for_series_level: int = 3,
    decision_aligned: bool | None = None,
) -> tuple[str, str]:
    """Return (model_name, why).

    Below three validation points we take the segment default, because selecting
    on two observations is fitting noise. Above it we take the series winner
    only when it beats the default by more than the spread across folds.

    `decision_aligned` scores the sparse classes on cumulative error instead of
    MASE. See `metrics.cumulative` for why that is not a cosmetic choice.
    """
    if not evaluation.folds:
        return segment_default or "seasonal_naive", "no validation possible, segment default applied"

    metric = primary_metric(evaluation.demand_class, decision_aligned)
    tiebreak = tiebreak_metric(evaluation.demand_class, decision_aligned)
    ranked = rank_candidates(
        {m: evaluation.mean_metric(m, metric) for m in evaluation.folds},
        {m: evaluation.mean_metric(m, tiebreak) for m in evaluation.folds}
        if tiebreak
        else None,
    )
    winner = ranked[0]
    winner_score = evaluation.mean_metric(winner, metric)

    if evaluation.n_validation_points < min_points_for_series_level:
        if segment_default and segment_default in evaluation.folds:
            return (
                segment_default,
                f"only {evaluation.n_validation_points} validation points, "
                f"using the {evaluation.demand_class.value} segment default",
            )
        return winner, f"{metric} {winner_score:.3f} across {evaluation.n_validation_points} windows"

    if segment_default and segment_default in evaluation.folds and segment_default != winner:
        default_score = evaluation.mean_metric(segment_default, metric)
        margin = default_score - winner_score
        noise = max(evaluation.spread(winner, metric), evaluation.spread(segment_default, metric))
        if not np.isfinite(noise) or margin <= noise:
            return (
                segment_default,
                f"{winner} led by {margin:.3f} {metric} but fold spread was {noise:.3f} — "
                "not a real difference, segment default kept",
            )

    return winner, f"lowest {metric} ({winner_score:.3f}) with bias {evaluation.mean_bias(winner):+.1%}"


def segment_defaults(
    evaluations: list[SeriesEvaluation], decision_aligned: bool | None = None
) -> dict[DemandClass, str]:
    """The model that scores best on average within each demand class.

    Same ranking rule as `select_model`, including the tiebreak, so a segment
    default can never be a model the per-series rule would have rejected.
    """
    totals: dict[DemandClass, dict[str, list[float]]] = {}
    seconds: dict[DemandClass, dict[str, list[float]]] = {}

    for evaluation in evaluations:
        demand_class = evaluation.demand_class
        metric = primary_metric(demand_class, decision_aligned)
        tiebreak = tiebreak_metric(demand_class, decision_aligned)
        bucket = totals.setdefault(demand_class, {})
        second = seconds.setdefault(demand_class, {})
        for model_name in evaluation.folds:
            value = evaluation.mean_metric(model_name, metric)
            if np.isfinite(value):
                bucket.setdefault(model_name, []).append(value)
            if tiebreak:
                other = evaluation.mean_metric(model_name, tiebreak)
                if np.isfinite(other):
                    second.setdefault(model_name, []).append(other)

    defaults: dict[DemandClass, str] = {}
    for demand_class, models in totals.items():
        if not models:
            continue
        second = seconds.get(demand_class) or None
        ranked = rank_candidates(
            {m: float(np.mean(v)) for m, v in models.items()},
            {m: float(np.mean(v)) for m, v in second.items()} if second else None,
        )
        defaults[demand_class] = ranked[0]
    return defaults


def evaluate_batched(
    series_ids: list[str],
    histories: dict[str, np.ndarray],
    profiles: dict,
    candidates_for,
    seasonal_period: int,
    horizon_for,
    covariates: dict[str, dict] | None = None,
    progress=None,
) -> list[SeriesEvaluation]:
    """Same evaluation as evaluate_series, reorganised so models see batches.

    The per-series loop is the obvious way to write this and it is the wrong one
    once a model lives behind HTTP: every candidate for every window becomes its
    own serial round trip, and the thread pool inside the client never gets a
    chance to do anything. Grouping by (model, window) instead lets one call
    cover every series at once.

    Local models are unaffected — their forecast_batch is a loop anyway.
    """
    covariates = covariates or {}
    evaluations = {
        sid: SeriesEvaluation(series_id=sid, demand_class=profiles[sid].demand_class)
        for sid in series_ids
    }

    # Which series can each model compete on, and with what window layout.
    model_work: dict[str, tuple] = {}
    for sid in series_ids:
        values = histories[sid]
        horizon = horizon_for(values)
        windows = make_windows(len(values), horizon)
        if not windows:
            continue
        for model in candidates_for(profiles[sid].demand_class):
            entry = model_work.setdefault(model.name, (model, []))
            entry[1].append((sid, horizon, windows))

    total = sum(len(v[1]) for v in model_work.values()) or 1
    done = 0

    for model_name, (model, work) in model_work.items():
        # Windows are indexed from the end, so window i means the same thing
        # across series even when horizons differ.
        max_windows = max(len(w[2]) for w in work)

        for window_index in range(max_windows):
            batch_ids: list[str] = []
            batch_hist: list[np.ndarray] = []
            batch_actual: list[np.ndarray] = []
            batch_past: list[dict] = []
            batch_future: list[dict] = []
            batch_horizon = 0

            for sid, horizon, windows in work:
                if window_index >= len(windows):
                    continue
                train_end, validation_end = windows[window_index]
                values = histories[sid]
                train = values[:train_end]
                actual = values[train_end:validation_end]
                if actual.size == 0:
                    continue

                past, future = _slice_covariates(
                    covariates.get(sid), train_end, validation_end
                )
                batch_ids.append(sid)
                batch_hist.append(train)
                batch_actual.append(actual)
                batch_past.append(past or {})
                batch_future.append(future or {})
                batch_horizon = max(batch_horizon, actual.size)

            if not batch_ids:
                continue

            try:
                forecasts = model.forecast_batch(
                    batch_hist,
                    horizon=batch_horizon,
                    seasonal_period=seasonal_period,
                    covariates=batch_past if any(batch_past) else None,
                    future_covariates=batch_future if any(batch_future) else None,
                )
            except Exception:  # noqa: BLE001 — a failed model drops out entirely
                continue

            for sid, actual, forecast in zip(batch_ids, batch_actual, forecasts):
                scores = score(
                    actual,
                    forecast.point[: actual.size],
                    histories[sid][: len(histories[sid]) - actual.size],
                    profiles[sid].demand_class,
                    seasonal_period,
                )
                evaluations[sid].folds.setdefault(model_name, []).append(scores)

            done += len(batch_ids)
            if progress:
                progress(done / total)

    return list(evaluations.values())
