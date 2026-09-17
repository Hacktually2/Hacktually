/**
 * What the forecasting backend ACTUALLY returns.
 *
 * Transcribed from live responses captured against `backend/` on 2026-09-17,
 * not from the contract in architecture.md — where the two disagree, this file
 * follows the wire. `app/dummy-data/types.ts` describes what the frontend
 * needs; this describes what it gets; `adapters.ts` is the distance between
 * them, and every gap in that distance is an item in migration-report.md.
 *
 * Keep this file honest. If the backend changes shape, change it here first and
 * let TypeScript find the call sites.
 */

/* ------------------------------------------------------------------ health */

export interface BackendHealthCheck {
  status: string;
  models_available: string[];
  foundation_models: Record<
    string,
    { available: boolean; error?: string; licence: string }
  >;
}

/* --------------------------------------------------------------- ingestion */

/** One canonical field and the source column the mapper chose for it. */
export interface BackendMappingField {
  canonical: string;
  source_column: string | null;
  confidence: number;
  reason: string;
}

export interface BackendIngestResult {
  dataset_id: string;
  status: string;
  rows: number;
  columns: string[];
  preset_matched: string | null;
  mapping: { fields: BackendMappingField[] };
}

export interface BackendMappingResponse {
  dataset_id: string;
  filename: string;
  preset_matched: string | null;
  confirmed: boolean;
  mapping: { fields: BackendMappingField[] };
  /** Present on the confirm response only. */
  health?: BackendHealth;
}

/* ----------------------------------------------------------------- health */

export interface BackendFinding {
  level: "ok" | "warn" | "error";
  text: string;
}

export interface BackendCleaning {
  rows_received: number;
  rows_after_clean: number;
  duplicates_found: number;
  missing_timestamps: number;
  unparseable_timestamps: number;
  negative_values: number;
  null_targets: number;
  reindexed_gaps: number;
  frequency: string;
  series_total: number;
  notes: string[];
}

export interface BackendHealth {
  health_score: number;
  frequency: string;
  /** "2024-01-01 00:00:00" — a naive datetime, not ISO-8601 with an offset. */
  history_start: string | null;
  history_end: string | null;
  periods: number;
  series_total: number;
  series_forecastable: number;
  series_excluded: { series_id: string; reason: string; fix?: string }[];
  series_excluded_count: number;
  findings: BackendFinding[];
  demand_portfolio: Record<string, number>;
  censored_series?: number;
  cleaning: BackendCleaning;
}

/* -------------------------------------------------------------- datasets */

export interface BackendDataset {
  dataset_id: string;
  filename: string;
  created_at: string;
  preset_matched: string | null;
  health_score: number | null;
  /** SQLite integer boolean. */
  mapping_confirmed: number;
  frequency: string | null;
  decision_mode: string | null;
}

/* ------------------------------------------------------------------- jobs */

export interface BackendJob {
  job_id: string;
  dataset_id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  /** Free text, e.g. "simulating business value". Not an enum. */
  stage: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------- forecasts */

export interface BackendSeriesProfile {
  series_id: string;
  item_id: string | null;
  location_id: string | null;
  demand_class: string | null;
  adi: number | null;
  cv2: number | null;
  model_name: string | null;
  wape: number | null;
  mase: number | null;
  bias: number | null;
  reason: string | null;
}

export interface BackendForecastList {
  dataset_id: string;
  model_mix: Record<string, number>;
  series: BackendSeriesProfile[];
}

export interface BackendForecastPoint {
  /** Naive datetime, no offset. */
  timestamp: string;
  forecast: number;
  lower: number;
  upper: number;
  model_name: string;
}

export interface BackendSeriesForecast {
  series_id: string;
  /**
   * FUTURE POINTS ONLY. There is no history here and no other endpoint serves
   * it, which is why every history-vs-forecast chart in the product still runs
   * on fixtures. See migration-report.md, gap B1.
   */
  forecast: BackendForecastPoint[];
  selection: Record<string, unknown> | null;
  candidates: Record<string, { wape: number; mase: number; bias: number }>;
  profile: Record<string, unknown> | null;
}

/* ------------------------------------------------------------ decisions */

export interface BackendRecommendation {
  dataset_id: string;
  series_id: string;
  mode: string;
  /** Three bands. The frontend vocabulary has four. */
  stockout_risk: "high" | "medium" | "low";
  days_until_stockout: number | null;
  recommended_qty: number;
  raw_material_qty: number | null;
  item_id: string | null;
  location_id: string | null;
  demand_class: string | null;
  model_name: string | null;
  /** Fraction, e.g. 0.4185 — not a percentage. */
  wape: number | null;
  mase: number | null;
  reason: string | null;
  /** Signed contributions that sum to recommended_qty. */
  explanation: { label: string; value: number }[];
}

export interface BackendValue {
  baseline: BackendValueSide;
  proposed: BackendValueSide;
  delta: {
    fill_rate_points: number;
    stockout_events_avoided: number;
    lost_sales_units_avoided: number;
    margin_recovered: number;
    holding_cost_change: number;
    total_benefit: number;
    working_capital_freed: number;
    working_capital_note: string;
  };
  scope: { series: number; periods: number };
}

export interface BackendValueSide {
  label: string;
  /** Fraction, e.g. 0.8863. */
  fill_rate: number;
  stockout_events: number;
  avg_inventory_units: number;
  avg_inventory_value: number;
  lost_sales_units: number;
  lost_margin: number;
  holding_cost: number;
  total_cost: number;
}

export interface BackendUsage {
  series_forecast: number;
  forecast_points: number;
  model_invocations: number;
  pipeline_runs: number;
}
