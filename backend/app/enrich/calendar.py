"""Indonesian demand calendar.

The moat. Lebaran moves roughly 11 days earlier each year, which is exactly what
fixed-calendar seasonality cannot represent and what foundation models trained
mostly on Western series have never seen.

Emitted as known-future covariates: every value is knowable in advance for the
whole horizon, which is what the model's past-and-future covariate path is for.

VERIFY BEFORE THE DEMO. Idul Fitri in Indonesia is fixed by sidang isbat, so the
official date can differ by a day from the astronomical estimate. Dates through
2026 follow the observed/announced calendar; 2027 onward are estimates and are
marked as such. A one-day error does not hurt the model (days_to_lebaran is a
ramp, not a spike) but it would be embarrassing on stage.
"""

from __future__ import annotations

from datetime import date, timedelta

import polars as pl

# (year, idul_fitri_day_1, ramadan_day_1, confirmed)
LEBARAN: tuple[tuple[int, date, date, bool], ...] = (
    (2020, date(2020, 5, 24), date(2020, 4, 24), True),
    (2021, date(2021, 5, 13), date(2021, 4, 13), True),
    (2022, date(2022, 5, 2), date(2022, 4, 3), True),
    (2023, date(2023, 4, 22), date(2023, 3, 23), True),
    (2024, date(2024, 4, 10), date(2024, 3, 12), True),
    (2025, date(2025, 3, 31), date(2025, 3, 1), True),
    (2026, date(2026, 3, 20), date(2026, 2, 18), True),
    (2027, date(2027, 3, 10), date(2027, 2, 8), False),
    (2028, date(2028, 2, 27), date(2028, 1, 28), False),
    (2029, date(2029, 2, 15), date(2029, 1, 16), False),
)

RAMADAN_LENGTH = 30
LEBARAN_HOLIDAY_DAYS = 6       # cuti bersama typically runs about a week
THR_WINDOW_DAYS = 21           # legally H-7, in practice paid 2-3 weeks ahead
PRE_LEBARAN_BUILDUP = 30       # the window where demand ramps

# Fixed-date national holidays (month, day).
FIXED_HOLIDAYS: tuple[tuple[int, int], ...] = (
    (1, 1),    # Tahun Baru
    (5, 1),    # Hari Buruh
    (6, 1),    # Hari Lahir Pancasila
    (8, 17),   # Hari Kemerdekaan
    (12, 25),  # Natal
)

# School calendar, approximate and stable year to year.
SCHOOL_BREAKS: tuple[tuple[tuple[int, int], tuple[int, int]], ...] = (
    ((6, 15), (7, 15)),   # kenaikan kelas
    ((12, 20), (1, 2)),   # semester break
)


def _lebaran_for_year(year: int) -> tuple[date, date, bool] | None:
    for y, fitri, ramadan, confirmed in LEBARAN:
        if y == year:
            return fitri, ramadan, confirmed
    return None


def _nearest_lebaran(day: date) -> tuple[date, bool]:
    """The Lebaran this date is closest to, so days_to_lebaran is always defined."""
    best, best_confirmed, best_gap = None, True, None
    for _, fitri, _, confirmed in LEBARAN:
        gap = abs((fitri - day).days)
        if best_gap is None or gap < best_gap:
            best, best_confirmed, best_gap = fitri, confirmed, gap
    return best, best_confirmed


def _in_school_break(day: date) -> bool:
    for (m1, d1), (m2, d2) in SCHOOL_BREAKS:
        start = date(day.year, m1, d1)
        end = (
            date(day.year, m2, d2)
            if (m2, d2) > (m1, d1)
            else date(day.year + 1, m2, d2)
        )
        if start <= day <= end:
            return True
        # Handle the wrap from the previous year's December break.
        if (m2, d2) < (m1, d1):
            prev_start = date(day.year - 1, m1, d1)
            prev_end = date(day.year, m2, d2)
            if prev_start <= day <= prev_end:
                return True
    return False


def calendar_row(day: date) -> dict:
    lebaran, confirmed = _nearest_lebaran(day)
    days_to_lebaran = (lebaran - day).days

    ramadan = _lebaran_for_year(lebaran.year)
    in_ramadan = False
    if ramadan:
        ramadan_start = ramadan[1]
        in_ramadan = ramadan_start <= day < lebaran

    return {
        "date": day,
        # Signed ramp. Negative after Lebaran. Clipped so distant dates stay neutral.
        "days_to_lebaran": max(-60, min(120, days_to_lebaran)),
        "is_ramadan": int(in_ramadan),
        "is_lebaran_buildup": int(0 < days_to_lebaran <= PRE_LEBARAN_BUILDUP),
        "is_lebaran_holiday": int(-LEBARAN_HOLIDAY_DAYS <= days_to_lebaran <= 0),
        "is_thr_window": int(0 < days_to_lebaran <= THR_WINDOW_DAYS),
        # Indonesian retail runs on gajian: end of month and the first week after.
        "is_payday_week": int(day.day >= 25 or day.day <= 5),
        "is_national_holiday": int((day.month, day.day) in FIXED_HOLIDAYS),
        "is_school_break": int(_in_school_break(day)),
        "lebaran_date_confirmed": int(confirmed),
    }


COVARIATE_COLUMNS = (
    "days_to_lebaran",
    "is_ramadan",
    "is_lebaran_buildup",
    "is_lebaran_holiday",
    "is_thr_window",
    "is_payday_week",
    "is_national_holiday",
    "is_school_break",
)


def build_calendar(start: date, end: date) -> pl.DataFrame:
    """One row per day between start and end inclusive."""
    days = (end - start).days
    rows = [calendar_row(start + timedelta(days=i)) for i in range(days + 1)]
    return pl.DataFrame(rows)


def attach(df: pl.DataFrame, timestamp_col: str = "timestamp") -> pl.DataFrame:
    """Join calendar features onto a canonical frame."""
    timestamps = df.get_column(timestamp_col)
    start = timestamps.min()
    end = timestamps.max()
    if start is None or end is None:
        return df

    calendar = build_calendar(start.date(), end.date()).with_columns(
        pl.col("date").cast(pl.Datetime).alias(timestamp_col)
    ).drop("date")

    return df.join(calendar, on=timestamp_col, how="left")


def future_covariates(last_timestamp: date, horizon: int, freq_days: int = 1) -> pl.DataFrame:
    """Calendar values for the forecast horizon — known in advance, by construction."""
    rows = [
        calendar_row(last_timestamp + timedelta(days=freq_days * (i + 1)))
        for i in range(horizon)
    ]
    return pl.DataFrame(rows)


def lebaran_uplift(
    df: pl.DataFrame,
    target_col: str = "target",
    timestamp_col: str = "timestamp",
    group_col: str | None = None,
) -> dict[str, float]:
    """Fallback if model covariates disappoint.

    Multiplicative lift in the buildup window versus the rest of the year.
    Estimated from history, not trained. Same demo beat, simpler mechanism.
    """
    enriched = attach(df, timestamp_col)
    if "is_lebaran_buildup" not in enriched.columns:
        return {}

    keys = [group_col] if group_col and group_col in enriched.columns else []
    grouped = enriched.group_by([*keys, "is_lebaran_buildup"]).agg(
        pl.col(target_col).mean().alias("mean_demand")
    )

    result: dict[str, float] = {}
    if not keys:
        rows = {r["is_lebaran_buildup"]: r["mean_demand"] for r in grouped.iter_rows(named=True)}
        base, peak = rows.get(0), rows.get(1)
        if base and peak and base > 0:
            result["ALL"] = round(peak / base, 3)
        return result

    for key_value in enriched.get_column(keys[0]).unique().to_list():
        subset = {
            r["is_lebaran_buildup"]: r["mean_demand"]
            for r in grouped.iter_rows(named=True)
            if r[keys[0]] == key_value
        }
        base, peak = subset.get(0), subset.get(1)
        if base and peak and base > 0:
            result[str(key_value)] = round(peak / base, 3)
    return result
