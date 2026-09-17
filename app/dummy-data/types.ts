/**
 * Response shapes for the REST contract frozen in architecture.md §"API contract".
 *
 * These types describe what the BACKEND returns. The frontend renders them and
 * formats them for display — it never derives risk, coverage, recommended
 * quantities or any other business value (frontend_user_flow.md §40).
 *
 * Three read models below are not in the frozen contract yet and are needed by
 * the dashboard. They are marked NEEDS-ENDPOINT so backend can add them:
 *   GET /api/v1/projects
 *   GET /api/v1/overview/{dataset_id}
 *   GET /api/v1/demand/{dataset_id}
 */

/* ---------------------------------------------------------------- primitives */

/** A value the dataset cannot support. Never render this as zero. */
export type Unavailable = { available: false; reason: string };
export type Available<T> = { available: true; value: T };
export type Maybe<T> = Available<T> | Unavailable;

export type RiskLevel = "healthy" | "watch" | "at_risk" | "critical";
export type DemandClass = "smooth" | "erratic" | "intermittent" | "lumpy";
export type TrendDirection = "up" | "down" | "flat";

export type JobStatus =
  | "queued"
  | "profiling"
  | "cleaning"
  | "classifying"
  | "forecasting"
  | "validating"
  | "completed"
  | "failed";

/* ------------------------------------------------------------------ projects */

/** NEEDS-ENDPOINT: GET /api/v1/projects */
export interface Project {
  project_id: string;
  name: string;
  organisation: string;
  industry_mode: "ritel" | "manufaktur";
  dataset_id: string;
  dataset_filename: string;
  /** ISO-8601. The frontend formats; the backend supplies the instant. */
  uploaded_at: string;
  forecast_generated_at: string | null;
  last_opened_at: string;
  status: "ready" | "processing" | "needs_review" | "failed";
  horizon_days: number;
  series_total: number;
  health_score: number;
  /** Small pre-rendered trend for the project card. Backend-supplied. */
  demand_sparkline: number[];
}

/* ------------------------------------------------------- mapping & profiling */

export type MappingConfidence = "high" | "medium" | "low";

/** GET /api/v1/datasets/{id}/mapping */
export interface MappingField {
  source_column: string;
  detected_field: string;
  /** Canonical field key, e.g. "timestamp" | "series_id" | "target". */
  canonical_key: string;
  confidence: MappingConfidence;
  confidence_score: number;
  /** Which tier resolved it — preset, rule or model. */
  resolved_by: "preset" | "rule" | "model";
  reasoning: string;
  sample_values: string[];
  required: boolean;
  /** Alternatives the user can switch to, supplied by the backend. */
  alternatives: { canonical_key: string; label: string }[];
}

export interface MappingResponse {
  dataset_id: string;
  preset_matched: string | null;
  overall_confidence: MappingConfidence;
  fields: MappingField[];
  unmapped_columns: string[];
}

/* -------------------------------------------------------------- data health */

/** GET /api/v1/datasets/{id}/health */
export interface HealthReport {
  dataset_id: string;
  rows_received: number;
  duplicates_found: number;
  missing_timestamps: number;
  negative_values: number;
  series_total: number;
  series_forecastable: number;
  series_excluded: { series_id: string; reason: string }[];
  detected_frequency: string;
  history_span_months: number;
  health_score: number;
  /** Ordered, backend-authored. Each is something the user can act on. */
  findings: {
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    detail: string;
    action: string | null;
  }[];
}

/* ------------------------------------------------------------------- job UX */

/** GET /api/v1/jobs/{job_id} */
export interface JobState {
  job_id: string;
  dataset_id: string;
  status: JobStatus;
  progress: number;
  steps: {
    key: string;
    label: string;
    state: "done" | "active" | "pending" | "failed";
    detail: string | null;
  }[];
  message: string | null;
}

/* ------------------------------------------------------------------ overview */

export interface KpiMetric {
  key: string;
  label: string;
  /**
   * Raw number; the frontend applies unit formatting only.
   * `null` means the dataset cannot support this metric — render the reason,
   * never a zero (frontend_user_flow.md §12.2, §47).
   */
  value: number | null;
  unavailable_reason: string | null;
  unit: "units" | "idr" | "count" | "percent";
  context: string;
  comparison: {
    delta_percent: number;
    direction: TrendDirection;
    label: string;
  } | null;
  accent: "demand" | "forecast" | "inventory" | "risk";
  href: string | null;
}

export interface SeriesPoint {
  /** ISO date at the detected frequency. */
  t: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  sales?: number | null;
}

export interface ForecastSeries {
  label: string;
  /**
   * Index of the LAST OBSERVED point, which is where the NOW marker is drawn.
   * `points[cutoff_index].actual` must be non-null and
   * `points[cutoff_index + 1].actual` must be null.
   *
   * That same point also carries forecast/lower/upper equal to its actual, so
   * the observed and predicted lines meet instead of showing a one-period gap.
   */
  cutoff_index: number;
  points: SeriesPoint[];
  historical_range: { from: string; to: string };
  forecast_range: { from: string; to: string };
  unit: "units";
}

export interface PriorityAction {
  rank: number;
  series_id: string;
  item_name: string;
  location: string;
  headline: string;
  reason: string;
  risk: RiskLevel;
  metric_label: string;
  metric_value: number;
  metric_unit: "units" | "days";
  href: string;
}

export interface InventoryPosture {
  /** Counts per risk band — backend-classified, never recomputed here. */
  bands: { risk: RiskLevel; label: string; series_count: number }[];
  total_series: number;
  inventory_value: Maybe<number>;
  median_coverage_days: number;
  narrative: string;
}

/** NEEDS-ENDPOINT: GET /api/v1/overview/{dataset_id} */
export interface OverviewResponse {
  dataset_id: string;
  generated_at: string;
  kpis: KpiMetric[];
  demand_chart: ForecastSeries;
  inventory: InventoryPosture;
  priority_actions: PriorityAction[];
}

/* ------------------------------------------------------------ demand & sales */

export interface DemandPatternBreakdown {
  classes: {
    demand_class: DemandClass;
    label: string;
    series_count: number;
    share_percent: number;
    description: string;
    typical_model: string;
  }[];
  total_series: number;
}

export interface CategoryBar {
  key: string;
  label: string;
  sublabel: string | null;
  value: number;
  share_percent: number;
}

export interface ForecastAccuracy {
  model_name: string;
  model_reason: string;
  wape_percent: number;
  bias_percent: number;
  mase: number | null;
  baseline_name: string;
  baseline_wape_percent: number;
  validation_windows: number;
}

export interface ForecastRow {
  date: string;
  series_id: string;
  item_name: string;
  location: string;
  forecast: number;
  lower: number;
  upper: number;
  actual: number | null;
  model: string;
}

export interface FilterOption {
  value: string;
  label: string;
  sublabel?: string;
}

/** NEEDS-ENDPOINT: GET /api/v1/demand/{dataset_id} */
export interface DemandResponse {
  dataset_id: string;
  chart: ForecastSeries;
  accuracy: ForecastAccuracy;
  pattern: DemandPatternBreakdown;
  sales_by_product: CategoryBar[];
  sales_by_location: CategoryBar[];
  forecast_rows: ForecastRow[];
  filters: {
    products: FilterOption[];
    locations: FilterOption[];
    date_presets: FilterOption[];
    comparisons: FilterOption[];
  };
  active_filters: {
    date_range: string;
    product: string;
    location: string;
    compare: string;
  };
  horizon_label: string;
}

/* ------------------------------------------------------------- supply chain */

export interface ReorderExplanation {
  /** Signed contributions that sum to recommended_qty. Backend-computed. */
  lines: { label: string; value: number; kind: "add" | "subtract" | "adjust" }[];
  total_label: string;
  total_value: number;
}

/** GET /api/v1/recommendations/{dataset_id} */
export interface InventoryRow {
  series_id: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location: string;
  category: string;
  current_stock: number;
  forecast_demand: number;
  lead_time_demand: number;
  safety_stock: number;
  coverage_days: number;
  days_until_stockout: number | null;
  risk: RiskLevel;
  risk_label: string;
  recommended_qty: number;
  lead_time_days: number;
  moq: number;
  demand_class: DemandClass;
  model: string;
  wape_percent: number;
  explanation: ReorderExplanation;
  recent_demand: number[];
}

export interface SupplyChainResponse {
  dataset_id: string;
  generated_at: string;
  mode: "ritel" | "manufaktur";
  rows: InventoryRow[];
  summary: {
    risk: RiskLevel;
    label: string;
    series_count: number;
    recommended_units: number;
  }[];
  filters: {
    locations: FilterOption[];
    categories: FilterOption[];
    risks: FilterOption[];
  };
}

/* ------------------------------------------------------------ value / session */

/** GET /api/v1/value/{dataset_id} */
export interface ValueSimulation {
  dataset_id: string;
  baseline_name: string;
  fill_rate_baseline_percent: number;
  fill_rate_model_percent: number;
  stockout_events_baseline: number;
  stockout_events_model: number;
  avg_inventory_value_baseline: number;
  avg_inventory_value_model: number;
  net_benefit_idr: number;
  window_label: string;
}

export interface Session {
  name: string;
  email: string;
  role: string;
  organisation: string;
  initials: string;
}
