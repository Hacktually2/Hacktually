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
from .metrics import primary_metric, score

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


def select_model(
    evaluation: SeriesEvaluation,
    segment_default: str | None = None,
    min_points_for_series_level: int = 3,
) -> tuple[str, str]:
    """Return (model_name, why).

    Below three validation points we take the segment default, because selecting
    on two observations is fitting noise. Above it we take the series winner
    only when it beats the default by more than the spread across folds.
    """
    if not evaluation.folds:
        return segment_default or "seasonal_naive", "no validation possible, segment default applied"

    metric = primary_metric(evaluation.demand_class)
    ranked = sorted(evaluation.folds, key=lambda m: evaluation.mean_metric(m, metric))
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


def segment_defaults(evaluations: list[SeriesEvaluation]) -> dict[DemandClass, str]:
    """The model that wins most often within each demand class."""
    totals: dict[DemandClass, dict[str, list[float]]] = {}
    for evaluation in evaluations:
        metric = primary_metric(evaluation.demand_class)
        bucket = totals.setdefault(evaluation.demand_class, {})
        for model_name in evaluation.folds:
            value = evaluation.mean_metric(model_name, metric)
            if np.isfinite(value):
                bucket.setdefault(model_name, []).append(value)

    defaults: dict[DemandClass, str] = {}
    for demand_class, models in totals.items():
        if not models:
            continue
        defaults[demand_class] = min(models, key=lambda m: float(np.mean(models[m])))
    return defaults
