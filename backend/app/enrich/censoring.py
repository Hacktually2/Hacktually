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
        flags = _by_ceiling(values)
        if has_inventory:
            flags = flags | _by_inventory(group)

        counts[series_id] = int(flags.sum())
        frames.append(group.with_columns(pl.Series(CENSORED, flags)))

    return pl.concat(frames), counts


def mask_for_fitting(values: np.ndarray, censored: np.ndarray) -> np.ndarray:
    """Replace censored observations with a local estimate of true demand.

    Conservative: the median of nearby uncensored periods, floored at the
    observed value, because true demand was at least what we sold.
    """
    if not censored.any():
        return values

    clean = values[~censored]
    if clean.size == 0:
        return values

    baseline = float(np.median(clean[clean > 0])) if (clean > 0).any() else 0.0
    out = values.astype(float).copy()
    for i in np.flatnonzero(censored):
        out[i] = max(values[i], baseline)
    return out
