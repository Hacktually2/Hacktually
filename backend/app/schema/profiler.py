"""Column profiling. Cheap statistics the mapper reasons over.

Never send raw data to an LLM — only these profiles.
"""

from __future__ import annotations

import polars as pl
from pydantic import BaseModel

MAX_SAMPLES = 5


class ColumnProfile(BaseModel):
    name: str
    dtype: str
    null_ratio: float
    cardinality: int
    n_rows: int
    samples: list[str]
    is_numeric: bool
    is_datetime_like: bool
    min_value: float | None = None
    max_value: float | None = None
    mean_value: float | None = None
    has_negatives: bool = False
    is_integral: bool = False
    monotonic_ratio: float = 0.0

    @property
    def unique_ratio(self) -> float:
        return self.cardinality / self.n_rows if self.n_rows else 0.0


def _parses_as_datetime(series: pl.Series) -> bool:
    """True when a decent share of non-null values parse as a date."""
    non_null = series.drop_nulls()
    if non_null.is_empty():
        return False
    sample = non_null.head(200).cast(pl.Utf8, strict=False)
    formats = (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M",
    )
    for fmt in formats:
        parsed = sample.str.to_datetime(format=fmt, strict=False)
        if parsed.drop_nulls().len() >= max(1, int(sample.len() * 0.8)):
            return True
    return False


def _monotonic_ratio(series: pl.Series) -> float:
    """Share of consecutive pairs that are non-decreasing. High for date columns."""
    non_null = series.drop_nulls()
    if non_null.len() < 2:
        return 0.0
    try:
        as_str = non_null.cast(pl.Utf8, strict=False).head(500).to_list()
    except Exception:
        return 0.0
    pairs = list(zip(as_str, as_str[1:]))
    if not pairs:
        return 0.0
    ok = sum(1 for a, b in pairs if a is not None and b is not None and a <= b)
    return ok / len(pairs)


def profile_column(df: pl.DataFrame, name: str) -> ColumnProfile:
    series = df.get_column(name)
    n_rows = df.height
    non_null = series.drop_nulls()

    is_numeric = series.dtype.is_numeric()
    is_temporal = series.dtype.is_temporal()
    is_datetime_like = is_temporal or (
        not is_numeric and _parses_as_datetime(series)
    )

    min_value = max_value = mean_value = None
    has_negatives = False
    is_integral = False
    if is_numeric and not non_null.is_empty():
        min_value = float(non_null.min())
        max_value = float(non_null.max())
        mean_value = float(non_null.mean())
        has_negatives = min_value < 0
        is_integral = bool(
            (non_null.cast(pl.Float64) % 1 == 0).all()
        )

    samples = [
        "" if v is None else str(v) for v in non_null.head(MAX_SAMPLES).to_list()
    ]

    return ColumnProfile(
        name=name,
        dtype=str(series.dtype),
        null_ratio=round(1 - (non_null.len() / n_rows), 4) if n_rows else 1.0,
        cardinality=int(non_null.n_unique()),
        n_rows=n_rows,
        samples=samples,
        is_numeric=is_numeric,
        is_datetime_like=is_datetime_like,
        min_value=min_value,
        max_value=max_value,
        mean_value=mean_value,
        has_negatives=has_negatives,
        is_integral=is_integral,
        monotonic_ratio=round(_monotonic_ratio(series), 3),
    )


def profile_dataframe(df: pl.DataFrame) -> list[ColumnProfile]:
    return [profile_column(df, name) for name in df.columns]


def profiles_for_llm(profiles: list[ColumnProfile]) -> list[dict]:
    """Metadata only. Never the data itself."""
    return [
        {
            "column": p.name,
            "dtype": p.dtype,
            "sample": p.samples,
            "null_ratio": p.null_ratio,
            "cardinality": p.cardinality,
            "min": p.min_value,
            "max": p.max_value,
        }
        for p in profiles
    ]
