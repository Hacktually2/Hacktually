"""Censored demand detection.

When a SKU stocks out, recorded sales understate real demand. Fit on sales and
the model learns to under-forecast exactly the items that already cost money.

We forecast demand, not sales. Those differ precisely when it matters.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from ..canonical import INVENTORY, SERIES_ID, TARGET, TIMESTAMP

CENSORED = "is_censored"
CEILING_RUN_MIN = 3        # consecutive periods at the same high value
CEILING_PERCENTILE = 0.90

# Zero-run detection. A stockout in real retail data looks like ZERO sales, not
# like sales pinned at a ceiling — validated against the VN2 in-stock ground
# truth, where weeks flagged out-of-stock averaged 0.00 units sold against 3.31
# in stocked weeks. The ceiling heuristic alone scored 0% recall there, because
# it was looking for the wrong signature entirely.
#
# The danger is the opposite mistake: for genuinely intermittent demand most
# zeros are real, and masking them all would destroy exactly the series Croston
# and TSB exist to handle. So a zero run only counts as suspicious when it is
# long relative to how often THIS item normally sells.
ZERO_RUN_MIN = 2
MAX_ZERO_RATE_FOR_STOCKOUT = 0.85

# Tuned against the VN2 in-stock ground truth, and tuned for PRECISION rather
# than recall. The sweep is worth recording because the conclusion is a product
# decision, not a parameter choice:
#
#   multiple   precision   recall
#     1.5        19.8%      28.2%
#     2.0        23.8%      24.2%
#     3.0        33.8%      17.9%
#     4.0        42.8%      14.0%
#
# Nothing reaches usable accuracy, and it cannot: a zero week caused by a
# stockout and a zero week caused by no demand are identical in a sales series.
# The information is not there. Since every false positive inflates a genuine
# zero to the median — teaching the model to over-order an item nobody wants —
# a wrong correction costs more than a missed one. So we sit at the conservative
# end and say so.
#
# With an inventory or in-stock column the same detection is exact. That is the
# single most valuable extra column a customer can send, and `method` below is
# what lets the UI ask for it.
ADI_RUN_MULTIPLE = 4.0


def _by_inventory(group: pl.DataFrame) -> np.ndarray:
    """Direct evidence: stock hit zero, so demand could not be observed."""
    inventory = group.get_column(INVENTORY).to_numpy().astype(float)
    return np.nan_to_num(inventory, nan=1.0) <= 0


def _by_ceiling(values: np.ndarray) -> np.ndarray:
    """Indirect evidence: sales pinned flat at a high value for several periods.

    A run of identical high sales is more likely a supply limit than real demand.
    """
    censored = np.zeros(len(values), dtype=bool)
    positive = values[values > 0]
    if positive.size < CEILING_RUN_MIN * 2:
        return censored

    ceiling = float(np.quantile(positive, CEILING_PERCENTILE))
    if ceiling <= 0:
        return censored

    run_start = 0
    for i in range(1, len(values) + 1):
        at_end = i == len(values)
        broke = at_end or values[i] != values[i - 1]
        if broke:
            run_length = i - run_start
            if (
                run_length >= CEILING_RUN_MIN
                and values[run_start] >= ceiling
                and values[run_start] > 0
            ):
                censored[run_start:i] = True
            run_start = i
    return censored


def _by_zero_run(values: np.ndarray) -> np.ndarray:
    """Runs of zero sales too long to be this item's normal quiet spell.

    Scaled by the item's own average demand interval: three silent weeks is
    alarming for something that sells weekly and unremarkable for something that
    sells monthly.
    """
    censored = np.zeros(len(values), dtype=bool)
    n = len(values)
    if n < 4:
        return censored

    nonzero = np.flatnonzero(values > 0)
    if nonzero.size == 0:
        return censored          # never sold: dormancy, not censoring

    zero_rate = 1.0 - (nonzero.size / n)
    if zero_rate > MAX_ZERO_RATE_FOR_STOCKOUT:
        return censored          # almost always zero: that IS the demand pattern

    adi = n / nonzero.size
    threshold = max(ZERO_RUN_MIN, int(np.ceil(ADI_RUN_MULTIPLE * adi)))

    # Only look between the first and last real sale. Zeros before an item
    # launched, or after it was discontinued, are absence of the product rather
    # than unmet demand — that is the lifecycle module's business.
    start, end = int(nonzero[0]), int(nonzero[-1])

    run_start = None
    for i in range(start, end + 1):
        if values[i] <= 0:
            if run_start is None:
                run_start = i
        else:
            if run_start is not None and (i - run_start) >= threshold:
                censored[run_start:i] = True
            run_start = None
    if run_start is not None and (end + 1 - run_start) >= threshold:
        censored[run_start : end + 1] = True

    return censored


def method_for(df: pl.DataFrame) -> dict:
    """How stockouts are being detected, and how much to trust it.

    Reported rather than hidden, because the honest answer changes what the
    customer should do: with stock data this is measurement, without it this is
    inference that misses most stockouts on purpose.
    """
    if INVENTORY in df.columns:
        return {
            "method": "inventory",
            "confidence": "high",
            "note": "stock levels supplied — stockout periods identified directly",
        }
    return {
        "method": "inferred",
        "confidence": "low",
        "note": (
            "no stock column supplied, so stockouts are inferred from unusually "
            "long zero runs. Tuned to avoid false alarms, which means most "
            "stockouts are missed. Send stock levels to measure this properly."
        ),
    }


def detect(df: pl.DataFrame) -> tuple[pl.DataFrame, dict[str, int]]:
    """Add an is_censored flag per row. Returns the frame and a count per series."""
    if df.height == 0:
        return df.with_columns(pl.lit(False).alias(CENSORED)), {}

    has_inventory = INVENTORY in df.columns
    counts: dict[str, int] = {}
    frames: list[pl.DataFrame] = []

    for (series_id,), group in df.sort([SERIES_ID, TIMESTAMP]).group_by(
        [SERIES_ID], maintain_order=True
    ):
        values = group.get_column(TARGET).to_numpy().astype(float)
        # Two signatures, because stockouts show up both ways: as zero sales
        # (nothing to sell) and as sales pinned at a ceiling (sold out early).
        flags = _by_zero_run(values) | _by_ceiling(values)
        if has_inventory:
            flags = flags | _by_inventory(group)

        counts[series_id] = int(flags.sum())
        frames.append(group.with_columns(pl.Series(CENSORED, flags)))

    return pl.concat(frames), counts


def mask_for_fitting(values: np.ndarray, censored: np.ndarray) -> np.ndarray:
    """NOT APPLIED BY DEFAULT. Measured, and it did not pay off.

    Benchmarked on VN2 with the real in-stock flags as ground truth — 250 series,
    13-week horizon, MASE median:

        model             raw      drop censored   impute median
        seasonal_naive  1.1028      1.1458           1.0945
        moving_average  0.8580      0.8580           0.8610
        croston         0.9208      0.9046           0.9365

    Even with PERFECT stockout labels, no correction helps consistently. The best
    result is Croston improving 1.8% by dropping censored periods, and the same
    treatment makes seasonal naive noticeably worse by breaking its time
    structure. Imputing the median inflates sparse series, which is why it hurts
    everything except the one model already biased low.

    The honest reading: a censored zero is a lower bound on demand, and recovering
    the true value needs a censored-likelihood estimator, not a substitution rule.
    That is a real piece of work and not a hackathon evening.

    So detection stays as REPORTING — telling an ops lead which weeks look like
    stockouts is useful on its own — and the pipeline does not silently rewrite
    history on the strength of a correction we cannot show works.
    """
    """Replace censored observations with a local estimate of true demand.

    Conservative: the median of nearby uncensored periods, floored at the
    observed value, because true demand was at least what we sold.
    """
    if not censored.any():
        return values

    clean = values[~censored]
    if clean.size == 0:
        return values

    # Impute from uncensored periods only. A censored zero is unknown demand,
    # not zero demand, so leaving it at zero teaches the model to under-forecast
    # precisely the items that already ran out.
    positive = clean[clean > 0]
    baseline = float(np.median(positive)) if positive.size else 0.0
    out = values.astype(float).copy()
    for i in np.flatnonzero(censored):
        out[i] = max(values[i], baseline)
    return out
