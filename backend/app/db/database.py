"""SQLite storage. Zero setup, and nobody scores database networking.

Table shapes are FROZEN — see architecture.md. Results are stored so the
dashboard never recomputes, and so the demo can run off precomputed artifacts
if anything breaks on stage.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
DB_PATH = DATA_DIR / "app.db"
UPLOAD_DIR = DATA_DIR / "uploads"

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    dataset_id      TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    raw_path        TEXT NOT NULL,
    schema_mapping  TEXT,
    preset_matched  TEXT,
    mapping_confirmed INTEGER DEFAULT 0,
    health_score    INTEGER,
    health_report   TEXT,
    frequency       TEXT,
    decision_mode   TEXT DEFAULT 'ritel'
);

-- One row per uploaded file. A dataset is the union of its sources, which is
-- what makes multi-branch upload work: each branch sends its own export, from
-- its own system, with its own column names, and each gets its own mapping.
CREATE TABLE IF NOT EXISTS dataset_sources (
    source_id       TEXT PRIMARY KEY,
    dataset_id      TEXT NOT NULL,
    filename        TEXT NOT NULL,
    raw_path        TEXT NOT NULL,
    branch_label    TEXT,
    schema_mapping  TEXT,
    preset_matched  TEXT,
    mapping_confirmed INTEGER DEFAULT 0,
    rows_received   INTEGER,
    locations       TEXT,          -- JSON list, used to replace on re-upload
    uploaded_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_dataset ON dataset_sources (dataset_id);

CREATE TABLE IF NOT EXISTS jobs (
    job_id      TEXT PRIMARY KEY,
    dataset_id  TEXT NOT NULL,
    status      TEXT NOT NULL,
    progress    INTEGER DEFAULT 0,
    stage       TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS series_profiles (
    dataset_id      TEXT NOT NULL,
    series_id       TEXT NOT NULL,
    item_id         TEXT,
    location_id     TEXT,
    adi             REAL,
    cv2             REAL,
    demand_class    TEXT,
    n_obs           INTEGER,
    n_nonzero       INTEGER,
    censored_periods INTEGER DEFAULT 0,
    forecastable    INTEGER DEFAULT 1,
    exclusion_reason TEXT,
    category        TEXT,
    avg_demand      REAL,
    PRIMARY KEY (dataset_id, series_id)
);

CREATE TABLE IF NOT EXISTS forecasts (
    dataset_id  TEXT NOT NULL,
    series_id   TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    forecast    REAL,
    lower       REAL,
    upper       REAL,
    model_name  TEXT,
    PRIMARY KEY (dataset_id, series_id, timestamp)
);

CREATE TABLE IF NOT EXISTS model_selection (
    dataset_id   TEXT NOT NULL,
    series_id    TEXT NOT NULL,
    model_name   TEXT,
    reason       TEXT,
    wape         REAL,
    mase         REAL,
    bias         REAL,
    rmse         REAL,   -- forecast-error sigma; safety stock is sized on this
    primary_metric TEXT,
    candidates   TEXT,
    PRIMARY KEY (dataset_id, series_id)
);

CREATE TABLE IF NOT EXISTS recommendations (
    dataset_id          TEXT NOT NULL,
    series_id           TEXT NOT NULL,
    mode                TEXT,
    stockout_risk       TEXT,
    days_until_stockout INTEGER,
    recommended_qty     REAL,
    raw_material_qty    REAL,
    explanation_json    TEXT,
    PRIMARY KEY (dataset_id, series_id)
);

-- Business parameters the decision engine needs and must never invent.
-- Resolved most-specific-first: series, then category, then dataset default.
-- Category scope is what makes this usable: an ops lead sets lead time once per
-- product group, not 428 times.
CREATE TABLE IF NOT EXISTS business_params (
    dataset_id        TEXT NOT NULL,
    scope             TEXT NOT NULL,   -- 'default' | 'category' | 'series'
    scope_value       TEXT NOT NULL DEFAULT '',
    lead_time_days    INTEGER,
    moq               REAL,
    service_level     REAL,
    unit_cost         REAL,
    unit_margin       REAL,
    holding_cost_rate REAL,
    bom_factor        REAL,
    cost_short        REAL,
    cost_over         REAL,
    updated_at        TEXT,
    PRIMARY KEY (dataset_id, scope, scope_value)
);

CREATE TABLE IF NOT EXISTS hierarchy (
    dataset_id TEXT PRIMARY KEY,
    result     TEXT
);

CREATE TABLE IF NOT EXISTS value_simulation (
    dataset_id TEXT PRIMARY KEY,
    result     TEXT
);

CREATE TABLE IF NOT EXISTS usage_meter (
    dataset_id     TEXT NOT NULL,
    recorded_at    TEXT NOT NULL,
    series_count   INTEGER,
    forecast_count INTEGER,
    model_runs     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_forecasts_series ON forecasts (dataset_id, series_id);
CREATE INDEX IF NOT EXISTS idx_recs_risk ON recommendations (dataset_id, stockout_risk);
"""


MIGRATIONS = (
    ("business_params", "cost_short", "REAL"),
    ("business_params", "cost_over", "REAL"),
)


def init() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)
        for table, column, kind in MIGRATIONS:
            existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")


@contextmanager
def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        yield conn
        conn.commit()
    finally:
        conn.close()


def execute(sql: str, params: tuple = ()) -> None:
    with _lock, connect() as conn:
        conn.execute(sql, params)


def execute_many(sql: str, rows: list[tuple]) -> None:
    if not rows:
        return
    with _lock, connect() as conn:
        conn.executemany(sql, rows)


def query(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: tuple = ()) -> sqlite3.Row | None:
    with connect() as conn:
        return conn.execute(sql, params).fetchone()


def to_json(value) -> str:
    return json.dumps(value, default=str)


def from_json(value: str | None, fallback=None):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback
