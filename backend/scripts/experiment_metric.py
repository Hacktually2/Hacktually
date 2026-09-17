"""Does scoring sparse demand on cumulative error change which model ships?

One backtest, two selection rules. Running the backtest once and scoring it
twice is the point: if each rule got its own backtest run, any difference could
be GPU nondeterminism or a different fold layout rather than the rule.

    py -3.11 scripts/experiment_metric.py [dataset_id]

Default dataset is the VN2 retail file — 599 series of real, genuinely
intermittent demand. Measuring this on our own generated data would prove
nothing, because we chose that data's sparsity ourselves.

Reported per rule:

  winners          which models actually ship, by demand class
  cumulative       relative error in TOTAL demand over the window — what the
                   reorder quantity is exposed to
  mase             per-period accuracy — what we select on today
  near-zero        share of chosen forecasts that are under a fifth of the
                   series' own mean. These are the ones that render as
                   "healthy, order nothing" for an item that sells.

The last column is the one that matters. A rule that lowers cumulative error
but still ships near-zero forecasts has not fixed the failure.
"""

from __future__ import annotations

import collections
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np  # noqa: E402
import polars as pl  # noqa: E402

from app import config as _config  # noqa: F401,E402 — loads .env
from app.canonical import SERIES_ID, TARGET, DemandClass  # noqa: E402
from app.db import database as db  # noqa: E402
from app.evaluation.backtest import (  # noqa: E402
    evaluate_batched,
    segment_defaults,
    select_model,
)
from app.demand.classifier import profile_series  # noqa: E402
from app.forecasting.router import candidates_for  # noqa: E402
from app.services import pipeline_service as svc  # noqa: E402

DEFAULT_DS = "ds_f6979759ea85"
RATE_MODELS = ("croston", "tsb", "moving_average", "seasonal_naive")


def load(dataset_id: str):
    canonical, frequency, _, _ = svc._load_canonical(dataset_id)
    rows = db.query(
        "SELECT series_id FROM series_profiles WHERE dataset_id = ? AND forecastable = 1",
        (dataset_id,),
    )
    series_ids = [r["series_id"] for r in rows]
    profiles = {
        sid: profile_series(canonical.filter(pl.col(SERIES_ID) == sid))[sid]
        for sid in series_ids
    }
    histories = svc._series_matrix(canonical, series_ids)
    covariates = svc._calendar_covariates(canonical, series_ids)
    return series_ids, profiles, histories, covariates, frequency


def summarise(evaluations, profiles, histories, decision_aligned: bool, horizon: int):
    defaults = segment_defaults(evaluations, decision_aligned)
    winners: dict[DemandClass, collections.Counter] = collections.defaultdict(
        collections.Counter
    )
    stats: dict[DemandClass, dict[str, list[float]]] = collections.defaultdict(
        lambda: {"cumulative": [], "mase": [], "wape": [], "near_zero": []}
    )

    for evaluation in evaluations:
        cls = evaluation.demand_class
        name, _ = select_model(evaluation, defaults.get(cls), decision_aligned=decision_aligned)
        winners[cls][name] += 1

        bucket = stats[cls]
        for metric in ("cumulative", "mase", "wape"):
            value = evaluation.mean_metric(name, metric)
            if np.isfinite(value):
                bucket[metric].append(value)

        # A chosen model whose own backtest cumulative error is ~1.0 with a
        # negative bias has predicted almost nothing: |sum(p)-sum(a)|/sum(a)
        # approaches 1 exactly when sum(p) approaches 0.
        cum = evaluation.mean_metric(name, "cumulative")
        biased_low = evaluation.mean_bias(name) < -0.6
        bucket["near_zero"].append(1.0 if (np.isfinite(cum) and cum > 0.6 and biased_low) else 0.0)

    return defaults, winners, stats


def report(label: str, defaults, winners, stats) -> None:
    print(f"\n{'=' * 78}\n{label}\n{'=' * 78}")
    print(f"segment defaults: " + ", ".join(f"{k.value}={v}" for k, v in sorted(
        defaults.items(), key=lambda kv: kv[0].value)))
    print(f"\n{'class':<14}{'n':>5}{'cumulative':>12}{'mase':>9}{'wape':>9}"
          f"{'near-zero':>11}   top winners")
    for cls in sorted(stats, key=lambda c: -sum(winners[c].values())):
        s = stats[cls]
        n = sum(winners[cls].values())
        top = ", ".join(f"{m} {c}" for m, c in winners[cls].most_common(3))
        print(f"{cls.value:<14}{n:>5}"
              f"{np.mean(s['cumulative']) if s['cumulative'] else float('nan'):>12.3f}"
              f"{np.mean(s['mase']) if s['mase'] else float('nan'):>9.3f}"
              f"{np.mean(s['wape']) if s['wape'] else float('nan'):>9.3f}"
              f"{np.mean(s['near_zero']) * 100 if s['near_zero'] else 0:>10.0f}%"
              f"   {top}")


def main() -> None:
    dataset_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DS
    db.init()

    print(f"dataset {dataset_id}")
    series_ids, profiles, histories, covariates, frequency = load(dataset_id)
    print(f"{len(series_ids)} forecastable series, frequency {frequency.value}")

    horizon = 30
    started = time.monotonic()
    evaluations = evaluate_batched(
        series_ids,
        histories,
        profiles,
        candidates_for,
        seasonal_period=frequency.seasonal_period,
        horizon_for=lambda values: min(horizon, max(7, len(values) // 4)),
        covariates=covariates,
        progress=None,
    )
    print(f"backtest of {len(evaluations)} series in {time.monotonic() - started:.0f}s")

    old = summarise(evaluations, profiles, histories, False, horizon)
    new = summarise(evaluations, profiles, histories, True, horizon)

    report("OLD RULE — sparse classes scored on MASE", *old)
    report("SHIPPED RULE — cumulative error, MASE breaking near-ties", *new)

    # ------------------------------------------------- tie tolerance sweep
    # The tolerance decides how different two models may be before MASE is
    # allowed to reorder them. Guessing it once is how the lumpy segment ended
    # up with a model that was 5% worse on the metric that sizes the order.
    from app.evaluation import metrics as metrics_mod

    original = metrics_mod.TIE_TOLERANCE
    print(f"\n{'=' * 78}\nTIE TOLERANCE SWEEP (sparse classes only)\n{'=' * 78}")
    print(f"{'tol':>6}  {'class':<14}{'cumulative':>12}{'mase':>9}{'near-zero':>11}   winner")
    try:
        for tolerance in (0.0, 0.01, 0.02, 0.05, 0.10):
            metrics_mod.TIE_TOLERANCE = tolerance
            defaults, winners, stats = summarise(
                evaluations, profiles, histories, True, horizon
            )
            for cls in (DemandClass.INTERMITTENT, DemandClass.LUMPY):
                if cls not in stats:
                    continue
                s = stats[cls]
                top = winners[cls].most_common(1)[0][0] if winners[cls] else "-"
                print(f"{tolerance:>6.2f}  {cls.value:<14}"
                      f"{np.mean(s['cumulative']):>12.3f}"
                      f"{np.mean(s['mase']):>9.3f}"
                      f"{np.mean(s['near_zero']) * 100:>10.0f}%   {top}")
            print()
    finally:
        metrics_mod.TIE_TOLERANCE = original

    # ------------------------------------------------------------ the verdict
    print(f"\n{'=' * 78}\nWHAT CHANGED\n{'=' * 78}")
    _, old_winners, old_stats = old
    _, new_winners, new_stats = new

    for cls in sorted(old_stats, key=lambda c: -sum(old_winners[c].values())):
        if cls not in (DemandClass.INTERMITTENT, DemandClass.LUMPY):
            continue
        n = sum(old_winners[cls].values())
        o, w = old_stats[cls], new_stats[cls]
        oc = np.mean(o["cumulative"]) if o["cumulative"] else float("nan")
        nc = np.mean(w["cumulative"]) if w["cumulative"] else float("nan")
        om = np.mean(o["mase"]) if o["mase"] else float("nan")
        nm = np.mean(w["mase"]) if w["mase"] else float("nan")
        onz = np.mean(o["near_zero"]) * 100 if o["near_zero"] else 0
        nnz = np.mean(w["near_zero"]) * 100 if w["near_zero"] else 0
        old_rate = sum(c for m, c in old_winners[cls].items() if m in RATE_MODELS)
        new_rate = sum(c for m, c in new_winners[cls].items() if m in RATE_MODELS)

        print(f"\n{cls.value} ({n} series)")
        print(f"  cumulative error   {oc:.3f} -> {nc:.3f}   "
              f"({(oc - nc) / oc * 100:+.1f}% better)" if np.isfinite(oc) and oc else "")
        print(f"  mase (the cost)    {om:.3f} -> {nm:.3f}   "
              f"({(nm - om) / om * 100:+.1f}% worse)" if np.isfinite(om) and om else "")
        print(f"  near-zero winners  {onz:.0f}% -> {nnz:.0f}%")
        print(f"  rate models win    {old_rate}/{n} -> {new_rate}/{n}")


if __name__ == "__main__":
    main()
