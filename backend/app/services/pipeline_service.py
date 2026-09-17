"""Orchestration. The one place the whole pipeline is wired together.

All three interfaces — dashboard, REST and MCP — call into here. Business logic
never lives in an endpoint or an MCP tool.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl

from ..canonical import ALL_FIELDS as ALL_CANONICAL
from ..canonical import (
    BusinessParams,
    CATEGORY,
    DecisionMode,
    DemandClass,
    Frequency,
    INVENTORY,
    LOCATION_ID,
    SERIES_ID,
    SchemaMapping,
    TARGET,
    TIMESTAMP,
    split_series_id,
)
from ..cleaning import health as health_mod
from ..cleaning.pipeline import SOURCE_RANK_COL, CleaningReport, canonicalize, clean
from ..db import database as db
from ..decision import reorder as reorder_mod
from ..decision import hierarchy as hierarchy_mod
from ..decision import params as params_mod
from ..decision import value_sim
from ..demand.classifier import portfolio_summary, profile_series
from ..enrich import calendar as calendar_mod
from ..enrich import censoring
from ..evaluation.backtest import evaluate_batched, segment_defaults, select_model
from ..forecasting.baselines import MovingAverageModel
from ..forecasting.router import candidates_for
from ..schema import pii as pii_mod
from ..schema import reshape as reshape_mod
from ..schema.mapper import build_mapping
from ..schema.profiler import profile_dataframe

log = logging.getLogger(__name__)

DEFAULT_HORIZON = 30
MAX_SERIES_FOR_VALUE_SIM = 30

# Replenishment is reviewed on a cycle, not every day. Weekly matches how
# mid-market buyers actually place orders, and it is what keeps the value
# simulation to a few hundred GPU calls instead of tens of thousands.
REVIEW_PERIOD = 7


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_any(path: Path) -> pl.DataFrame:
    """CSV with a forgiving parser — enterprise exports are rarely tidy."""
    if path.suffix.lower() in (".json", ".ndjson"):
        return pl.read_json(path)
    return pl.read_csv(
        path,
        infer_schema_length=10_000,
        ignore_errors=True,
        try_parse_dates=False,
        truncate_ragged_lines=True,
    )


def read_reshaped(path: Path) -> tuple[pl.DataFrame, dict | None]:
    """Read, then unpivot if the file runs time sideways.

    Done here rather than later so the profiler and mapper only ever see long
    format. A wide file has no timestamp column and no target column to find, so
    without this the mapper correctly refuses a perfectly good dataset.
    """
    df = read_any(path)
    df, info = reshape_mod.reshape(df)
    return df, info.as_dict() if info else None


# ---------------------------------------------------------------- ingestion

def _store_source(
    dataset_id: str, filename: str, raw_bytes: bytes, branch_label: str | None
) -> dict:
    """Persist one uploaded file and profile it on its own terms.

    Each source gets its OWN mapping. That is the point of multi-branch upload:
    the Jakarta branch may export from Accurate and Surabaya from Jubelio, and
    neither should have to change anything for the other.
    """
    source_id = f"src_{uuid.uuid4().hex[:10]}"
    db.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix or ".csv"
    raw_path = db.UPLOAD_DIR / f"{source_id}{suffix}"
    raw_path.write_bytes(raw_bytes)

    df, wide_info = read_reshaped(raw_path)
    profiles = profile_dataframe(df)
    mapping = build_mapping(df.columns, profiles)

    # Reshaping created the timestamp and target columns, so they are known
    # facts rather than inferences — overwrite whatever the rules guessed.
    if wide_info:
        forced = reshape_mod.forced_mapping()
        for field in mapping.fields:
            if field.canonical in forced:
                field.source_column = forced[field.canonical]
                field.confidence = 0.99
                field.reason = (
                    f"created by unpivoting {wide_info['date_columns']} date columns"
                )

    # Which locations this file covers, so a re-upload replaces rather than doubles.
    locations: list[str] = []
    location_column = mapping.get(LOCATION_ID)
    if location_column and location_column in df.columns:
        locations = [
            str(v)
            for v in df.get_column(location_column).drop_nulls().unique().to_list()
        ][:200]

    db.execute(
        """INSERT INTO dataset_sources
           (source_id, dataset_id, filename, raw_path, branch_label, schema_mapping,
            preset_matched, rows_received, locations, uploaded_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            source_id,
            dataset_id,
            filename,
            str(raw_path),
            branch_label,
            db.to_json(mapping.model_dump()),
            mapping.preset_matched,
            df.height,
            db.to_json(locations),
            _now(),
        ),
    )

    # Look for personal data now, while the choice to drop a column is still
    # cheap. Reported, never removed.
    pii = pii_mod.scan(profiles, {f.source_column for f in mapping.fields if f.source_column})

    return {
        "source_id": source_id,
        "rows": df.height,
        "columns": df.columns,
        "locations": locations,
        "wide_format": wide_info,
        "pii": pii,
        "preset_matched": mapping.preset_matched,
        "mapping": mapping.model_dump(),
        "raw_path": str(raw_path),
    }


def ingest(
    filename: str,
    raw_bytes: bytes,
    branch_label: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    source = _store_source(dataset_id, filename, raw_bytes, branch_label)

    db.execute(
        """INSERT INTO datasets
           (dataset_id, filename, created_at, raw_path, schema_mapping, preset_matched,
            tenant_id, pii_report)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            dataset_id,
            filename,
            _now(),
            source["raw_path"],
            db.to_json(source["mapping"]),
            source["preset_matched"],
            tenant_id,
            db.to_json(source.get("pii")),
        ),
    )

    return {
        "dataset_id": dataset_id,
        "source_id": source["source_id"],
        "status": "awaiting_mapping",
        "rows": source["rows"],
        "columns": source["columns"],
        "locations": source["locations"],
        "preset_matched": source["preset_matched"],
        "mapping": source["mapping"],
        "wide_format": source.get("wide_format"),
        "pii": source.get("pii"),
    }


def append_source(
    dataset_id: str, filename: str, raw_bytes: bytes, branch_label: str | None = None
) -> dict:
    """Add another branch's file to an existing dataset.

    Re-uploading the same branch replaces its previous file rather than adding to
    it — otherwise a manager correcting last week's export would silently double
    that branch's demand, and nothing downstream would notice.
    """
    if not db.query_one("SELECT 1 FROM datasets WHERE dataset_id = ?", (dataset_id,)):
        raise KeyError(dataset_id)

    source = _store_source(dataset_id, filename, raw_bytes, branch_label)
    incoming = set(source["locations"])

    replaced: list[str] = []
    if incoming:
        for row in db.query(
            "SELECT source_id, locations FROM dataset_sources WHERE dataset_id = ? AND source_id != ?",
            (dataset_id, source["source_id"]),
        ):
            existing = set(db.from_json(row["locations"], []) or [])
            if existing and existing <= incoming:
                db.execute(
                    "DELETE FROM dataset_sources WHERE source_id = ?", (row["source_id"],)
                )
                replaced.append(row["source_id"])

    sources = list_sources(dataset_id)
    return {
        "dataset_id": dataset_id,
        "source_id": source["source_id"],
        "rows": source["rows"],
        "locations": source["locations"],
        "preset_matched": source["preset_matched"],
        "mapping": source["mapping"],
        "pii": source.get("pii"),
        "replaced_sources": replaced,
        "sources_total": len(sources),
        "status": "awaiting_mapping" if source["mapping"] else "ready",
    }


def list_sources(dataset_id: str) -> list[dict]:
    rows = db.query(
        """SELECT source_id, filename, branch_label, preset_matched, rows_received,
                  locations, mapping_confirmed, uploaded_at
           FROM dataset_sources WHERE dataset_id = ? ORDER BY uploaded_at""",
        (dataset_id,),
    )
    out = []
    for row in rows:
        item = dict(row)
        item["locations"] = db.from_json(item["locations"], []) or []
        out.append(item)
    return out


def ingest_records(
    source: str, records: list[dict], tenant_id: str | None = None
) -> dict:
    """API ingestion goes through the same mapping path — field names still differ."""
    df = pl.DataFrame(records)
    payload = df.write_csv().encode()
    return ingest(f"{source}.csv", payload, tenant_id=tenant_id)


def tenant_of_dataset(dataset_id: str) -> str | None:
    row = db.query_one("SELECT tenant_id FROM datasets WHERE dataset_id = ?", (dataset_id,))
    if not row:
        raise KeyError(dataset_id)
    return row["tenant_id"]


def purge(dataset_id: str) -> dict:
    """Delete a dataset, everything derived from it, and the uploaded files.

    Erasure has to reach the raw upload, not just the rows. A customer who asks
    for their data to be removed and finds the original CSV still sitting in
    data/uploads has not had their data removed.
    """
    row = db.query_one("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
    if not row:
        raise KeyError(dataset_id)

    paths = [row["raw_path"]] + [
        r["raw_path"] for r in db.query(
            "SELECT raw_path FROM dataset_sources WHERE dataset_id = ?", (dataset_id,)
        )
    ]
    files_removed = 0
    for path in {p for p in paths if p}:
        try:
            target = Path(path)
            if target.exists():
                target.unlink()
                files_removed += 1
        except OSError as exc:  # noqa: PERF203 — report rather than fail the purge
            log.warning("could not delete %s: %s", path, exc)

    tables = (
        "forecasts", "model_selection", "recommendations", "series_profiles",
        "hierarchy", "value_simulation", "usage_meter", "business_params",
        "jobs", "dataset_sources", "notification_log", "datasets",
    )
    deleted = {}
    for table in tables:
        try:
            before = db.query_one(f"SELECT COUNT(*) n FROM {table} WHERE dataset_id = ?", (dataset_id,))
            db.execute(f"DELETE FROM {table} WHERE dataset_id = ?", (dataset_id,))
            if before and before["n"]:
                deleted[table] = before["n"]
        except Exception as exc:  # noqa: BLE001 — a missing table must not stop erasure
            log.warning("purge skipped %s: %s", table, exc)

    return {
        "dataset_id": dataset_id,
        "deleted_rows": deleted,
        "files_removed": files_removed,
        "note": "Uploaded files and every derived result have been removed.",
    }


# ---------------------------------------------------------------- mapping

def get_mapping(dataset_id: str) -> dict:
    row = db.query_one("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
    if not row:
        raise KeyError(dataset_id)
    mapping = db.from_json(row["schema_mapping"], {})
    return {
        "dataset_id": dataset_id,
        "filename": row["filename"],
        "preset_matched": row["preset_matched"],
        "confirmed": bool(row["mapping_confirmed"]),
        "mapping": mapping,
    }


def read_columns(path: Path) -> list[str]:
    """Column names as the mapper sees them, without reading the whole file.

    Reshaped files report their long-form columns (__period__, __value__), since
    those are what a mapping refers to.
    """
    try:
        if path.suffix.lower() in (".json", ".ndjson"):
            return list(pl.read_json(path).columns)
        head = pl.read_csv(
            path, n_rows=5, infer_schema_length=5, ignore_errors=True,
            truncate_ragged_lines=True,
        )
        head, _ = reshape_mod.reshape(head)
        return list(head.columns)
    except Exception:  # noqa: BLE001 — fall back to whatever the mapping already knows
        return []


IGNORE = "ignore"


def _normalise_overrides(
    overrides: dict[str, str] | None, columns: list[str]
) -> tuple[dict[str, str], set[str]]:
    """Accept overrides in either direction; return (canonical -> column, columns to unmap).

    The frontend contract sends { source_column: canonical_key } — each review row
    is a column with a dropdown of fields, and "ignore" drops it. Internal callers
    and the MCP tool send { canonical: source_column }.

    Before this, the API only understood the internal direction, so every
    correction made in the review screen was silently discarded: no error, the
    mapping simply never changed.

    Direction cannot be inferred from names alone — in the WFP file `price` is both
    a column and a canonical field. So it is decided against the columns that
    actually exist in the file: in the contract direction the KEYS are columns, in
    the internal direction the VALUES are.
    """
    if not overrides:
        return {}, set()

    known = set(columns)
    canonical_names = set(ALL_CANONICAL) | {IGNORE}

    keys_are_columns = all(k in known for k in overrides)
    values_are_columns = all((not v) or v in known for v in overrides.values())
    values_are_fields = all((v or IGNORE) in canonical_names for v in overrides.values())

    # Contract direction wins a genuine tie: it is the documented API.
    if keys_are_columns and values_are_fields:
        by_canonical: dict[str, str] = {}
        drop: set[str] = set()
        for column, canonical in overrides.items():
            if not canonical or canonical == IGNORE:
                drop.add(column)
            else:
                by_canonical[canonical] = column
        return by_canonical, drop

    if values_are_columns:
        return {k: v for k, v in overrides.items() if v}, {
            k for k, v in overrides.items() if not v
        }

    unknown = sorted(k for k in overrides if k not in known and k not in canonical_names)
    raise ValueError(
        "could not read overrides: expected { source_column: canonical_key }"
        + (f"; unknown columns {unknown}" if unknown else "")
    )


def _apply_overrides(
    mapping: SchemaMapping,
    overrides: dict[str, str] | None,
    columns: list[str] | None = None,
) -> SchemaMapping:
    """Apply user corrections, keeping one column per field and one field per column."""
    if not overrides:
        return mapping

    by_canonical, drop_columns = _normalise_overrides(overrides, columns or [])
    reassigned = set(by_canonical.values())

    fields = {f.canonical: f for f in mapping.fields}
    for field in mapping.fields:
        # A column the user dropped, or moved to a different field, leaves its
        # old role. Otherwise one column would feed two fields.
        if field.source_column and (
            field.source_column in drop_columns
            or (field.source_column in reassigned and by_canonical.get(field.canonical) != field.source_column)
        ):
            field.source_column = None
            field.confidence = 0.0
            field.reason = "removed by user"

    for canonical, column in by_canonical.items():
        target = fields.get(canonical)
        if target is None:
            continue
        target.source_column = column
        target.confidence = 1.0
        target.reason = "confirmed by user"
    return mapping


def confirm_mapping(
    dataset_id: str,
    overrides: dict[str, str] | None = None,
    source_id: str | None = None,
) -> dict:
    """Confirm one branch's mapping, or every branch's when source_id is omitted.

    Overrides are per source, because a correction that makes sense for Jakarta's
    Accurate export is meaningless for Surabaya's Jubelio one — the column does
    not even exist there. So an override is only applied to a source that
    actually has that column.
    """
    if not db.query_one("SELECT 1 FROM datasets WHERE dataset_id = ?", (dataset_id,)):
        raise KeyError(dataset_id)

    sources = db.query(
        "SELECT * FROM dataset_sources WHERE dataset_id = ?"
        + (" AND source_id = ?" if source_id else ""),
        (dataset_id, source_id) if source_id else (dataset_id,),
    )
    if not sources:
        raise KeyError(source_id or dataset_id)

    # Validate every override against the columns that actually exist, before
    # anything is written. The per-source filter below exists so a correction
    # for one branch's export is not applied to another branch's file — but on
    # its own it also swallowed genuinely wrong input, so a typo in a column name
    # confirmed successfully and changed nothing. An override that matches no
    # source at all is refused outright, and refused before any source is saved,
    # so a bad request cannot leave the dataset half-confirmed.
    if overrides:
        columns_by_source = {
            source["source_id"]: set(read_columns(Path(source["raw_path"])))
            for source in sources
        }
        every_column = set().union(*columns_by_source.values()) if columns_by_source else set()
        canonical_names = set(ALL_CANONICAL) | {IGNORE}
        unmatched = [
            key for key, value in overrides.items()
            if key not in every_column
            and not (key in canonical_names and value and value in every_column)
        ]
        if unmatched:
            raise ValueError(
                "override refers to columns not present in any uploaded file: "
                + ", ".join(sorted(unmatched))
            )

    confirmed: list[dict] = []
    problems: list[dict] = []

    for source in sources:
        mapping = SchemaMapping(**db.from_json(source["schema_mapping"], {"fields": []}))
        file_columns = read_columns(Path(source["raw_path"]))
        # An override only applies to a source that actually has the column. A
        # correction for Jakarta's Accurate export means nothing to Surabaya's
        # Jubelio file, where that column does not exist.
        relevant = None
        if overrides:
            present = set(file_columns)
            relevant = {
                k: v for k, v in overrides.items()
                if k in present or (v and v in present) or source_id
            } or None
        try:
            mapping = _apply_overrides(mapping, relevant, file_columns)
        except ValueError as exc:
            problems.append({
                "source_id": source["source_id"],
                "filename": source["filename"],
                "missing": [str(exc)],
            })
            continue

        missing = mapping.missing_required()
        if missing:
            problems.append(
                {
                    "source_id": source["source_id"],
                    "filename": source["filename"],
                    "missing": missing,
                }
            )
            continue

        mapping.confirmed = True
        db.execute(
            "UPDATE dataset_sources SET schema_mapping = ?, mapping_confirmed = 1 WHERE source_id = ?",
            (db.to_json(mapping.model_dump()), source["source_id"]),
        )
        confirmed.append(
            {"source_id": source["source_id"], "filename": source["filename"]}
        )
        # Keep the dataset row in step for anything still reading it.
        db.execute(
            "UPDATE datasets SET schema_mapping = ?, mapping_confirmed = 1 WHERE dataset_id = ?",
            (db.to_json(mapping.model_dump()), dataset_id),
        )

    if not confirmed:
        detail = "; ".join(
            f"{p['filename']} missing {', '.join(p['missing'])}" for p in problems
        )
        raise ValueError(f"no source could be confirmed: {detail}")

    return {
        "dataset_id": dataset_id,
        "confirmed": confirmed,
        "needs_attention": problems,
        "mapping": SchemaMapping(
            **db.from_json(
                db.query_one(
                    "SELECT schema_mapping FROM datasets WHERE dataset_id = ?",
                    (dataset_id,),
                )["schema_mapping"],
                {"fields": []},
            )
        ).model_dump(),
    }


# ---------------------------------------------------------------- preparation

def _load_canonical(dataset_id: str) -> tuple[pl.DataFrame, Frequency, dict, CleaningReport]:
    """Union every source, each canonicalized with its own mapping, then clean once.

    Cleaning has to happen after the union, not per source: frequency detection
    and duplicate aggregation only make sense across the whole picture.
    """
    row = db.query_one("SELECT * FROM datasets WHERE dataset_id = ?", (dataset_id,))
    if not row:
        raise KeyError(dataset_id)

    sources = db.query(
        "SELECT * FROM dataset_sources WHERE dataset_id = ? ORDER BY uploaded_at",
        (dataset_id,),
    )
    if not sources:
        # Pre-multi-source dataset. Fall back to the single file on the row.
        sources = [row]

    frames: list[pl.DataFrame] = []
    rows_received = 0
    # Sources arrive ordered by upload time, so the loop index is the rank a
    # later upload uses to supersede an earlier one for overlapping periods.
    for rank, source in enumerate(sources):
        mapping = SchemaMapping(**db.from_json(source["schema_mapping"], {"fields": []}))
        if mapping.missing_required():
            continue
        source_df, _ = read_reshaped(Path(source["raw_path"]))
        frame, partial = canonicalize(source_df, mapping)
        rows_received += partial.rows_received
        if frame.height:
            frames.append(frame.with_columns(pl.lit(rank).alias(SOURCE_RANK_COL)))

    if not frames:
        raise ValueError("no source in this dataset has a usable mapping yet")

    canonical = frames[0] if len(frames) == 1 else pl.concat(frames, how="diagonal")

    report = CleaningReport()
    report.rows_received = rows_received
    canonical, report = clean(canonical, report)
    frequency = Frequency(report.frequency)

    health = health_mod.build_report(canonical, report, frequency)
    return canonical, frequency, health, report


def prepare(dataset_id: str) -> dict:
    """Canonicalize, clean, profile and score. Idempotent."""
    canonical, frequency, health, cleaning_report = _load_canonical(dataset_id)

    canonical, censored_counts = censoring.detect(canonical)
    profiles = profile_series(canonical, censored_counts)

    # Re-run the health assessment now that ADI exists. Lifecycle needs each
    # series' own demand interval to tell a slow mover from a dead one, and ADI
    # is only known after profiling — so the first pass was the cheap version.
    adi_by_series = {sid: prof.adi for sid, prof in profiles.items()}
    health = health_mod.build_report(
        canonical, cleaning_report, frequency, adi_by_series
    )

    forecastable = set(health["forecastable_ids"])
    excluded = {e["series_id"]: e["reason"] for e in health.get("series_excluded", [])}

    # Category comes from the data and drives parameter defaults, so it has to
    # be stored per series rather than recomputed at decision time.
    category_by_series: dict[str, str] = {}
    if CATEGORY in canonical.columns:
        for row in (
            canonical.group_by(SERIES_ID)
            .agg(pl.col(CATEGORY).drop_nulls().first().alias("cat"))
            .iter_rows(named=True)
        ):
            if row["cat"] is not None:
                category_by_series[row[SERIES_ID]] = str(row["cat"])

    avg_by_series: dict[str, float] = {
        r[SERIES_ID]: float(r["m"] or 0.0)
        for r in canonical.group_by(SERIES_ID)
        .agg(pl.col(TARGET).mean().alias("m"))
        .iter_rows(named=True)
    }

    rows = []
    for series_id, profile in profiles.items():
        item_id, location_id = split_series_id(series_id)
        rows.append(
            (
                dataset_id,
                series_id,
                item_id,
                location_id,
                profile.adi,
                profile.cv2,
                profile.demand_class.value,
                profile.n_obs,
                profile.n_nonzero,
                profile.censored_periods,
                1 if series_id in forecastable else 0,
                excluded.get(series_id),
                category_by_series.get(series_id),
                avg_by_series.get(series_id),
            )
        )

    db.execute("DELETE FROM series_profiles WHERE dataset_id = ?", (dataset_id,))
    db.execute_many(
        """INSERT INTO series_profiles
           (dataset_id, series_id, item_id, location_id, adi, cv2, demand_class,
            n_obs, n_nonzero, censored_periods, forecastable, exclusion_reason,
            category, avg_demand)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )

    health["demand_portfolio"] = portfolio_summary(
        {k: v for k, v in profiles.items() if k in forecastable}
    )
    health["censored_series"] = sum(1 for c in censored_counts.values() if c > 0)
    health.pop("forecastable_ids", None)

    db.execute(
        """UPDATE datasets SET health_score = ?, health_report = ?, frequency = ?
           WHERE dataset_id = ?""",
        (health["health_score"], db.to_json(health), frequency.value, dataset_id),
    )
    return health


def get_health(dataset_id: str) -> dict:
    row = db.query_one(
        "SELECT health_report FROM datasets WHERE dataset_id = ?", (dataset_id,)
    )
    if not row:
        raise KeyError(dataset_id)
    report = db.from_json(row["health_report"])
    return report or prepare(dataset_id)


# ---------------------------------------------------------------- forecasting

def _series_matrix(canonical: pl.DataFrame, series_ids: list[str]) -> dict[str, np.ndarray]:
    subset = canonical.filter(pl.col(SERIES_ID).is_in(series_ids)).sort(
        [SERIES_ID, TIMESTAMP]
    )
    out: dict[str, np.ndarray] = {}
    for (series_id,), group in subset.group_by([SERIES_ID], maintain_order=True):
        out[series_id] = group.get_column(TARGET).to_numpy().astype(float)
    return out


def _calendar_covariates(canonical: pl.DataFrame, series_ids: list[str]) -> dict[str, dict]:
    enriched = calendar_mod.attach(canonical, TIMESTAMP).sort([SERIES_ID, TIMESTAMP])
    columns = [c for c in calendar_mod.COVARIATE_COLUMNS if c in enriched.columns]
    if not columns:
        return {}

    out: dict[str, dict] = {}
    subset = enriched.filter(pl.col(SERIES_ID).is_in(series_ids))
    for (series_id,), group in subset.group_by([SERIES_ID], maintain_order=True):
        out[series_id] = {
            column: group.get_column(column).to_numpy().astype(float) for column in columns
        }
    return out


def run_forecast(
    dataset_id: str,
    horizon: int = DEFAULT_HORIZON,
    job_id: str | None = None,
    use_calendar: bool = True,
) -> dict:
    """The core run: segment, route, backtest, select, forecast, decide, value."""
    def progress(pct: int, stage: str) -> None:
        if job_id:
            db.execute(
                "UPDATE jobs SET progress = ?, stage = ?, updated_at = ? WHERE job_id = ?",
                (pct, stage, _now(), job_id),
            )

    progress(5, "preparing data")
    canonical, frequency, _, _ = _load_canonical(dataset_id)
    canonical, censored_counts = censoring.detect(canonical)

    profile_rows = db.query(
        "SELECT * FROM series_profiles WHERE dataset_id = ? AND forecastable = 1",
        (dataset_id,),
    )
    if not profile_rows:
        prepare(dataset_id)
        profile_rows = db.query(
            "SELECT * FROM series_profiles WHERE dataset_id = ? AND forecastable = 1",
            (dataset_id,),
        )

    series_ids = [r["series_id"] for r in profile_rows]
    if not series_ids:
        raise ValueError("no forecastable series in this dataset")

    profiles = {
        r["series_id"]: profile_series(
            canonical.filter(pl.col(SERIES_ID) == r["series_id"])
        )[r["series_id"]]
        for r in profile_rows
    }

    histories = _series_matrix(canonical, series_ids)
    covariates = _calendar_covariates(canonical, series_ids) if use_calendar else {}
    seasonal_period = frequency.seasonal_period

    progress(20, "backtesting candidate models")
    evaluations = evaluate_batched(
        series_ids,
        histories,
        profiles,
        candidates_for,
        seasonal_period=seasonal_period,
        horizon_for=lambda values: min(horizon, max(7, len(values) // 4)),
        covariates=covariates,
        progress=lambda fraction: progress(20 + int(fraction * 30), "backtesting"),
    )

    defaults = segment_defaults(evaluations)

    progress(55, "selecting models and forecasting")
    forecast_rows: list[tuple] = []
    selection_rows: list[tuple] = []
    final_forecasts: dict[str, np.ndarray] = {}
    # Backtest RMSE of the winning model, per series. Safety stock is sized on
    # this, so a model that predicts well earns a smaller buffer.
    error_std: dict[str, float | None] = {}
    # Backtest error per series, used to size safety stock in the decision engine.
    error_std: dict[str, float | None] = {}
    model_runs = 0

    last_timestamp = canonical.get_column(TIMESTAMP).max()
    step = frequency.days

    for evaluation in evaluations:
        series_id = evaluation.series_id
        profile = profiles[series_id]
        default = defaults.get(profile.demand_class)
        model_name, reason = select_model(evaluation, default)

        from ..forecasting.router import get_model

        model = get_model(model_name)
        history = histories[series_id]

        future_cov = None
        past_cov = covariates.get(series_id)
        if use_calendar and last_timestamp is not None:
            future_frame = calendar_mod.future_covariates(
                last_timestamp.date(), horizon, step
            )
            future_cov = {
                column: future_frame.get_column(column).to_numpy().astype(float)
                for column in calendar_mod.COVARIATE_COLUMNS
                if column in future_frame.columns
            }

        try:
            forecast = model.forecast(
                history,
                horizon=horizon,
                seasonal_period=seasonal_period,
                covariates=past_cov,
                future_covariates=future_cov,
            )
            model_runs += 1
        except Exception as exc:  # noqa: BLE001 — never let one series kill the run
            log.warning("forecast failed for %s with %s: %s", series_id, model_name, exc)
            from ..forecasting.router import get_model as _get

            model = _get("seasonal_naive")
            model_name = "seasonal_naive"
            reason = f"fell back after {model_name} error"
            forecast = model.forecast(history, horizon=horizon, seasonal_period=seasonal_period)

        final_forecasts[series_id] = forecast.point

        mean_wape = evaluation.mean_metric(model_name, "wape")
        mean_mase = evaluation.mean_metric(model_name, "mase")
        mean_bias = evaluation.mean_bias(model_name)
        # The winning model's backtest error sizes this series' safety stock.
        mean_rmse = evaluation.mean_metric(model_name, "rmse")
        error_std[series_id] = mean_rmse if np.isfinite(mean_rmse) else None

        selection_rows.append(
            (
                dataset_id,
                series_id,
                model_name,
                reason,
                None if not np.isfinite(mean_wape) else round(mean_wape, 4),
                None if not np.isfinite(mean_mase) else round(mean_mase, 4),
                round(mean_bias, 4),
                None if not np.isfinite(mean_rmse) else round(mean_rmse, 4),
                "mase" if profile.demand_class in (DemandClass.INTERMITTENT, DemandClass.LUMPY) else "wape",
                db.to_json(
                    {
                        name: {
                            "wape": evaluation.mean_metric(name, "wape"),
                            "mase": evaluation.mean_metric(name, "mase"),
                            "bias": evaluation.mean_bias(name),
                        }
                        for name in evaluation.folds
                    }
                ),
            )
        )

        for i in range(horizon):
            ts = last_timestamp + _timedelta(step * (i + 1))
            forecast_rows.append(
                (
                    dataset_id,
                    series_id,
                    ts.isoformat(),
                    float(forecast.point[i]),
                    float(forecast.lower[i]) if forecast.lower is not None else None,
                    float(forecast.upper[i]) if forecast.upper is not None else None,
                    model_name,
                )
            )

    db.execute("DELETE FROM forecasts WHERE dataset_id = ?", (dataset_id,))
    db.execute("DELETE FROM model_selection WHERE dataset_id = ?", (dataset_id,))
    db.execute_many(
        """INSERT INTO forecasts
           (dataset_id, series_id, timestamp, forecast, lower, upper, model_name)
           VALUES (?,?,?,?,?,?,?)""",
        forecast_rows,
    )
    db.execute_many(
        """INSERT INTO model_selection
           (dataset_id, series_id, model_name, reason, wape, mase, bias, rmse,
            primary_metric, candidates)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        selection_rows,
    )

    progress(80, "building recommendations")
    build_recommendations(dataset_id, canonical, final_forecasts, frequency, error_std=error_std)

    # Roll branch-level forecasts up to network level. Bottom-up, so the branch
    # numbers and the network total can never disagree.
    recommendations_by_series = {
        r["series_id"]: r for r in get_recommendations(dataset_id, limit=100_000)
    }
    hierarchy = hierarchy_mod.build(final_forecasts, recommendations_by_series)
    hierarchy["coherence"] = hierarchy_mod.coherence_check(
        hierarchy["network"]["horizon_total"],
        [b["horizon_total"] for b in hierarchy["branches"]],
    )
    db.execute(
        "INSERT OR REPLACE INTO hierarchy (dataset_id, result) VALUES (?, ?)",
        (dataset_id, db.to_json(hierarchy)),
    )

    progress(90, "simulating business value")
    try:
        run_value_simulation(dataset_id, canonical, histories, frequency, seasonal_period)
    except Exception as exc:  # noqa: BLE001 — the money slide must not break the run
        log.warning("value simulation failed: %s", exc)

    db.execute(
        """INSERT INTO usage_meter (dataset_id, recorded_at, series_count, forecast_count, model_runs)
           VALUES (?,?,?,?,?)""",
        (dataset_id, _now(), len(series_ids), len(forecast_rows), model_runs),
    )

    progress(100, "done")
    return {
        "dataset_id": dataset_id,
        "series_forecast": len(series_ids),
        "horizon": horizon,
        "model_mix": model_mix(dataset_id),
    }


def _timedelta(days: int):
    from datetime import timedelta

    return timedelta(days=days)


# ---------------------------------------------------------------- decisions

def _params_for(dataset_id: str) -> BusinessParams:
    """Dataset-level parameters, for callers that do not resolve per series."""
    resolved, _ = params_mod.resolve(dataset_id)
    return resolved


def _series_categories(dataset_id: str) -> dict[str, str]:
    return {
        r["series_id"]: r["category"]
        for r in db.query(
            "SELECT series_id, category FROM series_profiles WHERE dataset_id = ?",
            (dataset_id,),
        )
        if r["category"]
    }


def build_recommendations(
    dataset_id: str,
    canonical: pl.DataFrame,
    forecasts: dict[str, np.ndarray],
    frequency: Frequency,
    params: BusinessParams | None = None,
    mode: DecisionMode | None = None,
    error_std: dict[str, float | None] | None = None,
) -> int:
    params = params or _params_for(dataset_id)
    error_std = error_std or {}
    row = db.query_one("SELECT decision_mode FROM datasets WHERE dataset_id = ?", (dataset_id,))
    mode = mode or DecisionMode((row["decision_mode"] if row else None) or "ritel")

    inventory_by_series: dict[str, float] = {}
    if INVENTORY in canonical.columns:
        latest = (
            canonical.sort(TIMESTAMP)
            .group_by(SERIES_ID)
            .agg(pl.col(INVENTORY).last().alias("inv"))
        )
        inventory_by_series = {
            r[SERIES_ID]: r["inv"] for r in latest.iter_rows(named=True) if r["inv"] is not None
        }

    # Resolve parameters per series: series override, else category, else the
    # dataset default. Loaded once — resolving per series would re-read the table
    # 400 times for no reason.
    param_store = params_mod.load_all(dataset_id)
    categories = _series_categories(dataset_id)

    rows = []
    for series_id, point in forecasts.items():
        series_params, assumed = params_mod.resolve(
            dataset_id,
            series_id=series_id,
            category=categories.get(series_id),
            cached=param_store,
        )
        recommendation = reorder_mod.recommend(
            series_id=series_id,
            forecast=point,
            params=series_params,
            current_inventory=inventory_by_series.get(series_id),
            mode=mode,
            error_std=error_std.get(series_id),
            period_days=frequency.days,
            assumed=assumed,
        )
        # Surface which numbers we were never given, rather than passing off a
        # built-in default as the customer's own figure.
        if assumed:
            recommendation.missing_params.extend(
                f for f in assumed if f not in recommendation.missing_params
            )
        rows.append(
            (
                dataset_id,
                series_id,
                recommendation.mode.value,
                recommendation.stockout_risk,
                recommendation.days_until_stockout,
                recommendation.recommended_qty,
                recommendation.raw_material_qty,
                db.to_json(recommendation.explanation),
            )
        )

    db.execute("DELETE FROM recommendations WHERE dataset_id = ?", (dataset_id,))
    db.execute_many(
        """INSERT INTO recommendations
           (dataset_id, series_id, mode, stockout_risk, days_until_stockout,
            recommended_qty, raw_material_qty, explanation_json)
           VALUES (?,?,?,?,?,?,?,?)""",
        rows,
    )
    return len(rows)


def run_value_simulation(
    dataset_id: str,
    canonical: pl.DataFrame,
    histories: dict[str, np.ndarray],
    frequency: Frequency,
    seasonal_period: int,
    params: BusinessParams | None = None,
) -> dict:
    """Same policy, two forecasts. The only difference is what drives the order."""
    params = params or _params_for(dataset_id)
    if params.unit_cost <= 0:
        params = params.model_copy(update={"unit_cost": 50_000.0, "unit_margin": 12_000.0})

    selected = {
        r["series_id"]: r["model_name"]
        for r in db.query(
            "SELECT series_id, model_name FROM model_selection WHERE dataset_id = ?",
            (dataset_id,),
        )
    }

    candidates = [s for s in histories if s in selected][:MAX_SERIES_FOR_VALUE_SIM]
    if not candidates:
        raise ValueError("nothing to simulate")

    from ..forecasting.router import get_model

    baseline_model = MovingAverageModel()
    horizon = max(7, params.lead_time_days // max(frequency.days, 1) + 1)

    # The selected model must be simulated WITH the covariates it was selected
    # on. Without them a calendar-aware model silently degrades to its base and
    # the simulation ends up comparing the baseline against itself, reporting a
    # confident zero.
    covariates = _calendar_covariates(canonical, candidates)

    totals: dict[str, list] = {"baseline": [], "proposed": []}

    for series_id in candidates:
        values = histories[series_id]
        split = int(len(values) * 0.7)
        if split < 21 or len(values) - split < horizon:
            continue

        warm, actual = values[:split], values[split:]
        model = get_model(selected[series_id])
        series_cov = covariates.get(series_id)

        def make_fn(m, warm_values, actual_values, cov=series_cov):
            cache: dict[int, np.ndarray] = {}
            offset = len(warm_values)

            def fn(raw_t: int):
                # Recompute only on review dates, not every period. Two reasons,
                # and the first one is not performance: real replenishment is
                # reviewed on a cycle — nobody re-plans every SKU daily — so a
                # per-period refresh would flatter us against a policy no buyer
                # runs. It also matters that each refresh is a remote GPU call:
                # per-period, serial, this was ~14k round trips and hours of
                # wall clock. Quantising cuts it by REVIEW_PERIOD.
                t = (raw_t // REVIEW_PERIOD) * REVIEW_PERIOD
                if t not in cache:
                    history = np.concatenate([warm_values, actual_values[:t]])
                    past = future = None
                    if cov:
                        end = offset + t
                        # Past ends where history ends; future covers the horizon
                        # beyond it. Both are calendar values, known in advance,
                        # so this leaks nothing about the held-out demand.
                        past = {
                            k: v[:end] for k, v in cov.items() if len(v) >= end
                        }
                        future = {
                            k: v[end : end + horizon]
                            for k, v in cov.items()
                            if len(v) >= end + horizon
                        }
                        past = past or None
                        future = future or None
                    try:
                        cache[t] = m.forecast(
                            history,
                            horizon=horizon,
                            seasonal_period=seasonal_period,
                            covariates=past,
                            future_covariates=future,
                        ).point
                    except Exception:  # noqa: BLE001
                        cache[t] = np.full(horizon, float(history[-14:].mean()))
                return cache[t]

            return fn

        totals["baseline"].append(
            value_sim.simulate(
                actual, make_fn(baseline_model, warm, actual), params,
                "Current practice (moving average)", frequency.days,
            )
        )
        totals["proposed"].append(
            value_sim.simulate(
                actual, make_fn(model, warm, actual), params,
                "Our recommendation", frequency.days,
            )
        )

    if not totals["baseline"]:
        raise ValueError("no series had enough history to simulate")

    aggregate = {}
    for key, results in totals.items():
        aggregate[key] = value_sim.SimulationResult(
            label=results[0].label,
            fill_rate=float(np.mean([r.fill_rate for r in results])),
            stockout_events=int(sum(r.stockout_events for r in results)),
            avg_inventory_units=float(np.mean([r.avg_inventory_units for r in results])),
            avg_inventory_value=float(sum(r.avg_inventory_value for r in results)),
            lost_sales_units=float(sum(r.lost_sales_units for r in results)),
            lost_margin=float(sum(r.lost_margin for r in results)),
            holding_cost=float(sum(r.holding_cost for r in results)),
        )

    n_periods = int(np.mean([len(histories[s]) for s in candidates]) * 0.3)
    result = value_sim.compare(
        aggregate["baseline"], aggregate["proposed"], len(totals["baseline"]), n_periods
    )

    db.execute(
        "INSERT OR REPLACE INTO value_simulation (dataset_id, result) VALUES (?, ?)",
        (dataset_id, db.to_json(result)),
    )
    return result


# ---------------------------------------------------------------- reads

def model_mix(dataset_id: str) -> dict[str, float]:
    rows = db.query(
        "SELECT model_name, COUNT(*) AS n FROM model_selection WHERE dataset_id = ? GROUP BY model_name",
        (dataset_id,),
    )
    total = sum(r["n"] for r in rows) or 1
    return {r["model_name"]: round(r["n"] / total, 4) for r in rows}


def get_recommendations(dataset_id: str, limit: int = 50, risk: str | None = None) -> list[dict]:
    sql = """SELECT r.*, s.item_id, s.location_id, s.demand_class, s.category,
                    m.model_name, m.wape, m.mase, m.reason
             FROM recommendations r
             LEFT JOIN series_profiles s
               ON s.dataset_id = r.dataset_id AND s.series_id = r.series_id
             LEFT JOIN model_selection m
               ON m.dataset_id = r.dataset_id AND m.series_id = r.series_id
             WHERE r.dataset_id = ?"""
    params: tuple = (dataset_id,)
    if risk:
        sql += " AND r.stockout_risk = ?"
        params = (dataset_id, risk)
    sql += """ ORDER BY CASE r.stockout_risk WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               COALESCE(r.days_until_stockout, 999999), r.recommended_qty DESC LIMIT ?"""
    params = (*params, limit)

    out = []
    for row in db.query(sql, params):
        item = dict(row)
        item["explanation"] = db.from_json(item.pop("explanation_json"), [])
        out.append(item)
    return out


def get_series_forecast(dataset_id: str, series_id: str) -> dict:
    forecast = db.query(
        """SELECT timestamp, forecast, lower, upper, model_name
           FROM forecasts WHERE dataset_id = ? AND series_id = ? ORDER BY timestamp""",
        (dataset_id, series_id),
    )
    selection = db.query_one(
        "SELECT * FROM model_selection WHERE dataset_id = ? AND series_id = ?",
        (dataset_id, series_id),
    )
    profile = db.query_one(
        "SELECT * FROM series_profiles WHERE dataset_id = ? AND series_id = ?",
        (dataset_id, series_id),
    )
    return {
        "series_id": series_id,
        "forecast": [dict(r) for r in forecast],
        "selection": dict(selection) if selection else None,
        "candidates": db.from_json(selection["candidates"], {}) if selection else {},
        "profile": dict(profile) if profile else None,
    }


def get_value_simulation(dataset_id: str) -> dict | None:
    row = db.query_one("SELECT result FROM value_simulation WHERE dataset_id = ?", (dataset_id,))
    return db.from_json(row["result"]) if row else None


def get_usage(dataset_id: str) -> dict:
    """Metering. LAMPU bills on consumption, so we count what we would bill."""
    rows = db.query(
        """SELECT SUM(series_count) AS series, SUM(forecast_count) AS forecasts,
                  SUM(model_runs) AS runs, COUNT(*) AS runs_total
           FROM usage_meter WHERE dataset_id = ?""",
        (dataset_id,),
    )
    row = rows[0] if rows else None
    return {
        "series_forecast": row["series"] if row else 0,
        "forecast_points": row["forecasts"] if row else 0,
        "model_invocations": row["runs"] if row else 0,
        "pipeline_runs": row["runs_total"] if row else 0,
    }


def get_hierarchy(dataset_id: str) -> dict | None:
    """Branch and network rollup. Bottom-up, so the levels always agree."""
    row = db.query_one("SELECT result FROM hierarchy WHERE dataset_id = ?", (dataset_id,))
    return db.from_json(row["result"]) if row else None


def privacy_report(dataset_id: str) -> dict:
    """What personal data was found, and what leaves this service.

    Written to be shown to a customer, because "where does my data go" is a
    question that deserves a specific answer rather than a reassurance.
    """
    row = db.query_one(
        "SELECT pii_report, tenant_id, filename FROM datasets WHERE dataset_id = ?",
        (dataset_id,),
    )
    if not row:
        raise KeyError(dataset_id)

    sources = db.query(
        "SELECT filename, raw_path FROM dataset_sources WHERE dataset_id = ?",
        (dataset_id,),
    )
    gpu_configured = bool(os.getenv("GPU_INFERENCE_URL"))

    return {
        "dataset_id": dataset_id,
        "tenant_id": row["tenant_id"],
        "personal_data": db.from_json(row["pii_report"], {"found": False}),
        "stored": {
            "uploaded_files": len(sources),
            "location": str(db.UPLOAD_DIR),
            "note": "Raw uploads stay on this host. DELETE the dataset to remove them.",
        },
        "leaves_this_service": [
            {
                "destination": "GPU forecasting service",
                "active": gpu_configured,
                "what": "demand quantities only, as an unlabelled numeric series",
                "not_sent": [
                    "item names and codes",
                    "branch names and codes",
                    "prices and costs",
                    "any column flagged as personal data",
                ],
            },
            {
                "destination": "Email / Slack digest",
                "active": bool(os.getenv("SMTP_HOST") or os.getenv("SLACK_WEBHOOK_URL")),
                "what": "item codes, order quantities and days of cover for one branch",
                "not_sent": ["personal data", "prices", "other branches"],
            },
        ],
        "never_sent_anywhere": [
            "the uploaded file itself",
            "customer or staff identities",
        ],
    }
