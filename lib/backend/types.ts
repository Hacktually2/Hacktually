/**
 * What the forecasting backend returns that is NOT already a frontend type.
 *
 * This file used to describe every response, because the wire shapes and the
 * screens' types were different things and `adapters.ts` was the distance
 * between them. That distance is now mostly gone: as of the 2026-09-18 backend,
 * `/projects`, `/overview`, `/demand`, `/recommendations`, `/mapping`,
 * `/health` and `/value` return the types in `app/dummy-data/types.ts` exactly,
 * so the client returns them directly and there is nothing left to translate.
 *
 * What remains here is the handful of endpoints that still have their own shape.
 * If one of these grows into a frontend type too, delete it from here.
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

export interface BackendIngestResult {
  dataset_id: string;
  status: string;
  rows: number;
  columns: string[];
  preset_matched: string | null;
  /** The detected mapping, in the review screen's own shape. */
  mapping: { fields: unknown[] };
}

/** One dataset as `/datasets` lists it. `/projects` is the richer read model. */
export interface BackendDataset {
  dataset_id: string;
  filename: string;
  created_at: string;
  preset_matched: string | null;
  health_score: number | null;
  mapping_confirmed: number;
  frequency: string | null;
  decision_mode: string | null;
}

/* ------------------------------------------------------------------- jobs */

/**
 * The job now carries the named steps the processing screen renders, so the
 * old regex-matching on a free-text `stage` is gone (gap B8, fixed).
 *
 * `status` is the one thing still out of step: the backend reports `running`,
 * which is not one of the frontend's `JobStatus` values.
 */
export interface BackendJob {
  job_id: string;
  dataset_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  steps: {
    key: string;
    label: string;
    state: "done" | "active" | "pending" | "failed";
    detail: string | null;
  }[];
  message: string | null;
  error?: string | null;
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
  timestamp: string;
  forecast: number;
  lower: number;
  upper: number;
  model_name: string;
}

export interface BackendSeriesForecast {
  series_id: string;
  forecast: BackendForecastPoint[];
  selection: Record<string, unknown> | null;
  candidates: Record<string, { wape: number; mase: number; bias: number }>;
  profile: Record<string, unknown> | null;
}

/* ------------------------------------------------------------- parameters */

/**
 * Planning parameters, which do NOT match `PlanningParameters` yet.
 *
 * `current` is what somebody has set, keyed by scope. `suggested` is what the
 * dataset can tell us — note `lead_time_days` and `moq` come back null, because
 * they are commercial terms that are not in a sales export. That null is the
 * point: the screen asks for them rather than inventing a default.
 */
export interface BackendParams {
  dataset_id: string;
  current: {
    default: Record<string, number>;
    category: Record<string, Record<string, number>>;
    series: Record<string, Record<string, number>>;
  };
  suggested: {
    dataset_id: string;
    categories: {
      category: string;
      series: number;
      avg_daily_demand: number | null;
      lead_time_days: number | null;
      moq: number | null;
    }[];
  };
}

/* ---------------------------------------------------------------- branches */

/**
 * Per-branch health. New in this backend and not yet rendered anywhere.
 *
 * Scored on rates rather than raw counts, so a big branch is not flagged just
 * for being big — which is the right way to answer "which branch is doing
 * worst".
 */
export interface BackendBranches {
  dataset_id: string;
  branches: {
    location_id: string;
    series_count: number;
    demand_forecast: number;
    demand_share_percent: number;
    demand_trend_percent: number;
    attention_count: number;
    attention_rate_percent: number;
    dormant_series: number;
    dormant_rate_percent: number;
    dormant_units_held: number;
    median_wape_percent: number | null;
    units_to_order: number;
    units_available_to_transfer: number;
    units_coverable_by_transfer: number;
    flags: string[];
  }[];
  /**
   * Null until a forecast has run — `services/branches.py` returns
   * `"network": None` when the dataset has no enriched rows yet.
   *
   * Declared nullable because it is. It was not, and a freshly uploaded project
   * crashed the whole projects page on `network.series`: the caller checked
   * that the request succeeded, which it had, and the service answered 200 with
   * nothing in it.
   */
  network: {
    branches: number;
    series: number;
    attention_rate_percent: number;
    dormant_rate_percent: number;
    demand_trend_percent: number;
    median_wape_percent: number | null;
  } | null;
  transfers: unknown[];
  note: string | null;
}

/**
 * GET /api/v1/datasets/{id}/hierarchy — the network total, rolled up.
 *
 * Bottom-up, so `coherence` is a property rather than a hope: the network
 * figure IS the sum of the branch figures, and the endpoint reports the gap so
 * the claim can be checked rather than trusted. On the demo file the gap is
 * 0.09 units across 822,991, which is float addition and nothing else.
 *
 * That matters more than it sounds. Top-down or reconciled forecasts can leave
 * a head office total that no branch recognises, and the argument that follows
 * is what kills adoption of a planning tool.
 */
export interface BackendHierarchy {
  /** Null before a forecast has run, for the same reason as `/branches`. */
  network: {
    horizon_total: number;
    per_period: number[];
  } | null;
  branches: {
    location_id: string;
    horizon_total: number;
    series: number;
    recommended_qty: number;
    series_at_risk: number;
  }[];
  coherence: {
    network_total: number;
    sum_of_branches: number;
    gap: number;
    coherent: boolean;
  } | null;
}
