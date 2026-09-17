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
  /**
   * The cleaned canonical `target`. There is exactly one observed series: the
   * pipeline carries a single target column, and censoring produces a mask and
   * a health-report flag, not a second de-censored series. A "demand vs
   * recorded sales" comparison would therefore be the same line drawn twice.
   */
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
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
  };
  active_filters: {
    date_range: string;
    product: string;
    location: string;
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
/**
 * One row of the inventory workspace.
 *
 * Nullable fields are the ones the live backend does not send today. `null`
 * means "not measurable from this response", never zero, and the table renders
 * a dash with the reason rather than a number the frontend made up. Each one is
 * a numbered gap in migration-report.md; when the backend starts sending it,
 * drop the `| null` and TypeScript will point at every render site.
 */
export interface InventoryRow {
  series_id: string;
  item_id: string;
  item_name: string;
  location_id: string;
  location: string;
  /** Gap B6 — no category on a recommendation. */
  category: string | null;
  /** Read out of the reorder explanation. */
  current_stock: number | null;
  /** Gap B5 — the horizon total is not broken out. */
  forecast_demand: number | null;
  lead_time_demand: number | null;
  safety_stock: number | null;
  /** Gap B5 — would require the frontend to divide stock by demand. */
  coverage_days: number | null;
  days_until_stockout: number | null;
  risk: RiskLevel;
  risk_label: string;
  recommended_qty: number;
  /** Gap B5 — only embedded in an explanation label today. */
  lead_time_days: number | null;
  moq: number | null;
  demand_class: DemandClass;
  model: string;
  wape_percent: number | null;
  explanation: ReorderExplanation;
  /** Gap B1 — no history endpoint, so no sparkline. */
  recent_demand: number[] | null;
}

/**
 * An inventory row with nothing missing.
 *
 * The fixtures are hand-built and carry every field, so the screens and checks
 * that only ever run against fixtures — the scenario simulator, the planning
 * parameters, the fixture self-check — can keep treating them as non-null. Live
 * rows are plain `InventoryRow` and must handle the nulls.
 */
export type CompleteInventoryRow = InventoryRow & {
  category: string;
  current_stock: number;
  forecast_demand: number;
  lead_time_demand: number;
  safety_stock: number;
  coverage_days: number;
  lead_time_days: number;
  moq: number;
  wape_percent: number;
  recent_demand: number[];
};

export interface SupplyChainResponse {
  dataset_id: string;
  generated_at: string;
  mode: "ritel" | "manufaktur";
  rows: InventoryRow[];
  /**
   * The one sentence the page leads with. Phrased by the backend so the
   * frontend never has to decide what counts as "needing attention".
   */
  headline: {
    attention_count: number;
    total_count: number;
    units_to_order: number;
    detail: string;
  };
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

/* ---------------------------------------------------------------- activity */

export type ActivityKind =
  | "dataset_uploaded"
  | "dataset_updated"
  | "mapping_confirmed"
  | "forecast_generated"
  | "health_changed"
  | "recommendations_refreshed";

/**
 * One entry in the data-change log.
 *
 * Only events that changed the data or the results belong here. Navigation,
 * filtering and sorting do not, because the log exists to answer "why do the
 * numbers look different from yesterday".
 *
 * NEEDS-ENDPOINT: GET /api/v1/activity?project_id=
 */
export interface ActivityEvent {
  event_id: string;
  kind: ActivityKind;
  project_id: string;
  project_name: string;
  organisation: string;
  /** ISO-8601 with offset. */
  at: string;
  actor: string;
  summary: string;
  /** Short factual lines, already phrased by the backend. */
  details: string[];
}

/* ------------------------------------------------------------ data updates */

/**
 * Dry-run result of merging a newer export into an existing dataset.
 *
 * The merge key is the canonical (timestamp, series_id) pair. Rows present in
 * both files are replaced by the incoming values; rows only in the existing
 * dataset are kept. Nothing is deleted.
 *
 * NEEDS-ENDPOINT: POST /api/v1/datasets/{id}/append?dry_run=true
 */
export interface MergePreview {
  dataset_id: string;
  incoming_filename: string;
  incoming_rows: number;
  /** Rows whose (timestamp, series_id) is not already present. */
  rows_added: number;
  /** Rows that overlap and carry a different value, so they replace it. */
  rows_updated: number;
  /** Rows that overlap and match, so nothing changes. */
  rows_unchanged: number;
  /** Existing rows the incoming file does not mention. Always retained. */
  rows_retained: number;
  series_new: string[];
  series_total_before: number;
  series_total_after: number;
  coverage_before: { from: string; to: string };
  coverage_after: { from: string; to: string };
  /** A sample of overlapping rows, so "updated" is inspectable, not asserted. */
  conflicts: {
    series_id: string;
    item_name: string;
    timestamp: string;
    existing_value: number;
    incoming_value: number;
  }[];
  warnings: {
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    detail: string;
  }[];
  /** False when the file cannot be merged at all; `warnings` says why. */
  mergeable: boolean;
}

/* --------------------------------------------------------------- scenarios */

/**
 * Inputs to a what-if run.
 *
 * Every lever maps onto a variable the decision engine already uses, so a
 * scenario is the same engine run with different inputs rather than a second
 * model that could disagree with the first.
 *
 * Capacity is in units, not rupiah: this dataset carries no unit cost, which is
 * why Inventory Value reads "Unavailable". A rupiah budget would be invented.
 */
export interface ScenarioInput {
  /** Multiplier on each item's replenishment lead time. */
  lead_time_multiplier: number;
  /** Multiplier on forecast demand, e.g. a bigger Lebaran than expected. */
  demand_multiplier: number;
  /** Target service level as a percentage; drives the safety factor. */
  service_level: number;
  /** Multiplier on each item's minimum order quantity. */
  moq_multiplier: number;
  /** Units orderable this cycle. null means unconstrained. */
  capacity_units: number | null;
}

export interface ScenarioTotals {
  units_to_order: number;
  items_needing_order: number;
  items_at_risk: number;
  median_cover_days: number;
}

export interface ScenarioRow {
  series_id: string;
  item_name: string;
  location: string;
  risk_before: RiskLevel;
  risk_after: RiskLevel;
  qty_before: number;
  qty_after: number;
  cover_before: number;
  cover_after: number;
  lead_time_after: number;
  /** Set when capacity ran out before this item was covered. */
  deferred: boolean;
}

/** NEEDS-ENDPOINT: POST /api/v1/simulate/{dataset_id} */
export interface ScenarioOutcome {
  scenario: ScenarioInput;
  baseline: ScenarioTotals;
  simulated: ScenarioTotals;
  /** Every item, ordered by how much the scenario changed it. */
  rows: ScenarioRow[];
  /** Backend-phrased observations. The frontend renders, never writes these. */
  notes: string[];
  capacity: { capped: boolean; deferred_items: number; unmet_units: number } | null;
}

/* -------------------------------------------------------------- parameters */

/**
 * Business parameters the decision engine needs but the forecast cannot supply.
 *
 * architecture.md is explicit that these are entered per category with bulk
 * apply and overridable per SKU, and that a missing parameter is asked for
 * rather than invented. `source` is what makes that visible: a planner can see
 * at a glance which numbers came out of their own export and which are house
 * defaults standing in until someone says otherwise.
 *
 * NEEDS-ENDPOINT: GET/PUT /api/v1/datasets/{id}/parameters
 */
export interface CategoryParameters {
  category: string;
  series_count: number;
  lead_time_days: number;
  service_level: number;
  moq: number;
  /** Read from the dataset's own columns, a house default, or set by a user. */
  source: "dataset" | "default" | "user";
  /** SKUs in this category carrying a per-SKU override. */
  overrides: number;
}

export interface PlanningParameters {
  dataset_id: string;
  horizon_days: number;
  /**
   * Value simulation inputs. Null means nobody has supplied them, and the
   * rupiah figures are withheld rather than guessed.
   */
  margin_percent: number | null;
  holding_cost_percent: number | null;
  categories: CategoryParameters[];
}
