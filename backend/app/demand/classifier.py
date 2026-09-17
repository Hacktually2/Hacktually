"""Syntetos-Boylan demand classification. Deterministic, no training.

Classification does NOT pick the model. It picks which models may compete.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from ..canonical import DemandClass, SERIES_ID, SeriesProfile, TARGET

ADI_CUTOFF = 1.32
CV2_CUTOFF = 0.49


def classify_values(values: np.ndarray) -> tuple[float, float, DemandClass]:
    """ADI and CV squared over the non-zero demand."""
    n = len(values)
    nonzero = values[values > 0]
    if n == 0 or nonzero.size == 0:
        return float("inf"), 0.0, DemandClass.LUMPY

    adi = n / nonzero.size

    mean = float(nonzero.mean())
    if mean == 0:
        cv2 = 0.0
    else:
        std = float(nonzero.std(ddof=0))
        cv2 = (std / mean) ** 2

    if adi < ADI_CUTOFF:
        demand_class = DemandClass.SMOOTH if cv2 < CV2_CUTOFF else DemandClass.ERRATIC
    else:
        demand_class = (
            DemandClass.INTERMITTENT if cv2 < CV2_CUTOFF else DemandClass.LUMPY
        )

    return round(adi, 3), round(cv2, 3), demand_class


def profile_series(
    df: pl.DataFrame, censored_counts: dict[str, int] | None = None
) -> dict[str, SeriesProfile]:
    censored_counts = censored_counts or {}
    profiles: dict[str, SeriesProfile] = {}

    for (series_id,), group in df.sort(SERIES_ID).group_by([SERIES_ID], maintain_order=True):
        values = group.get_column(TARGET).to_numpy().astype(float)
        adi, cv2, demand_class = classify_values(values)
        profiles[series_id] = SeriesProfile(
            series_id=series_id,
            n_obs=len(values),
            n_nonzero=int((values > 0).sum()),
            adi=adi if np.isfinite(adi) else 999.0,
            cv2=cv2,
            demand_class=demand_class,
            censored_periods=censored_counts.get(series_id, 0),
        )
    return profiles


def portfolio_summary(profiles: dict[str, SeriesProfile]) -> dict[str, float]:
    """Share of each demand class, for the dashboard."""
    total = len(profiles) or 1
    counts = {cls.value: 0 for cls in DemandClass}
    for profile in profiles.values():
        counts[profile.demand_class.value] += 1
    return {k: round(v / total, 4) for k, v in counts.items()}
