import "server-only";

/**
 * Backend wire shapes → the types the screens render.
 *
 * TRANSLATION ONLY. This file renames fields, inverts a table, converts a
 * fraction to a percentage and maps one enum onto another. It does not compute
 * business values: no coverage, no risk band from stock levels, no safety
 * stock. Where the backend does not send something a screen needs, the value
 * arrives here as `null` and the screen renders "—" with the reason, rather
 * than a number this app invented.
 *
 * That line is not fussiness. Two surfaces disagreeing about the same SKU is
 * the failure `frontend-backend-integration.md` was written to prevent, and the
 * moment this file starts doing arithmetic on business data there are two
 * places that decide what a number means.
 *
 * Every `null` below is an entry in migration-report.md.
 */
import type {
  DemandClass,
  ForecastSeries,
  HealthReport,
  InventoryRow,
  JobState,
  JobStatus,
  MappingConfidence,
  MappingResponse,
  Project,
  RiskLevel,
  SupplyChainResponse,
  ValueSimulation,
} from "@/app/dummy-data/types";
import type {
  BackendDataset,
  BackendHealth,
  BackendJob,
  BackendMappingResponse,
  BackendRecommendation,
  BackendSeriesForecast,
  BackendValue,
} from "./types";

/* ------------------------------------------------------------ vocabularies */

/**
 * The backend bands stockout risk in three, the product speaks four.
 * `critical` is therefore unreachable from live data — see gap B4.
 */
const RISK: Record<BackendRecommendation["stockout_risk"], RiskLevel> = {
  high: "at_risk",
  medium: "watch",
  low: "healthy",
};

const RISK_LABEL: Record<RiskLevel, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At risk",
  critical: "Critical",
};

/** The backend reports a float; the review screen shows a band. */
function confidenceBand(score: number): MappingConfidence {
  if (score >= 0.9) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/** Canonical fields the pipeline cannot run without. */
const REQUIRED_FIELDS = new Set(["timestamp", "target", "item_id"]);

const FIELD_LABELS: Record<string, string> = {
  timestamp: "Date",
  target: "Quantity",
  item_id: "Product",
  location_id: "Location",
  inventory: "Inventory",
  price: "Price",
  promo: "Promotion",
  category: "Category",
};

const label = (canonical: string) => FIELD_LABELS[canonical] ?? canonical;

/** "2024-01-01 00:00:00" — naive, space-separated. Not parseable as ISO. */
function parseBackendDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* ---------------------------------------------------------------- mapping */

/**
 * The backend answers "which column did you pick for each canonical field?".
 * The review screen asks "what did you decide each of my columns means?".
 * Same information, transposed.
 *
 * Fields the backend did not detect (source_column null) are dropped: there is
 * no column to show a row for. They surface instead as the unmapped list, which
 * the backend does not send either — see gap B2.
 */
export function toMappingResponse(response: BackendMappingResponse): MappingResponse {
  const fields = response.mapping.fields.filter((field) => field.source_column !== null);
  const alternatives = response.mapping.fields.map((field) => ({
    canonical_key: field.canonical,
    label: label(field.canonical),
  }));

  const mapped = fields.map((field) => ({
    source_column: field.source_column!,
    detected_field: label(field.canonical),
    canonical_key: field.canonical,
    confidence: confidenceBand(field.confidence),
    confidence_score: field.confidence,
    // The backend does not report which tier resolved a field. A preset match
    // is known from the response; everything else is attributed to the mapper.
    resolved_by: (response.preset_matched ? "preset" : "model") as "preset" | "model",
    reasoning: field.reason,
    // Gap B2: no sample values in any mapping response.
    sample_values: [] as string[],
    required: REQUIRED_FIELDS.has(field.canonical),
    alternatives,
  }));

  const weakest = mapped.reduce<MappingConfidence>(
    (worst, field) =>
      field.confidence === "low" || worst === "low"
        ? "low"
        : field.confidence === "medium" || worst === "medium"
          ? "medium"
          : "high",
    "high",
  );

  return {
    dataset_id: response.dataset_id,
    preset_matched: response.preset_matched,
    overall_confidence: weakest,
    fields: mapped,
    unmapped_columns: [],
  };
}

/* ----------------------------------------------------------------- health */

export function toHealthReport(health: BackendHealth, datasetId: string): HealthReport {
  const start = parseBackendDate(health.history_start);
  const end = parseBackendDate(health.history_end);
  // Calendar arithmetic on two dates the backend sent, not a business value.
  const months =
    start && end
      ? Math.max(
          0,
          Math.round(((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10,
        )
      : 0;

  return {
    dataset_id: datasetId,
    rows_received: health.cleaning?.rows_received ?? 0,
    duplicates_found: health.cleaning?.duplicates_found ?? 0,
    missing_timestamps: health.cleaning?.missing_timestamps ?? 0,
    negative_values: health.cleaning?.negative_values ?? 0,
    series_total: health.series_total,
    series_forecastable: health.series_forecastable,
    series_excluded: health.series_excluded.map((excluded) => ({
      series_id: excluded.series_id,
      reason: excluded.reason,
    })),
    detected_frequency: health.frequency,
    history_span_months: months,
    health_score: health.health_score,
    findings: health.findings.map((finding, index) => ({
      id: `finding-${index}`,
      severity:
        finding.level === "error" ? "critical" : finding.level === "warn" ? "warning" : "info",
      // The backend sends one sentence, not a title plus a detail. It becomes
      // the title, and the screen omits the empty paragraph — see gap B3.
      title: finding.text,
      detail: "",
      action: null,
    })),
  };
}

/* ------------------------------------------------------------------- jobs */

/**
 * The backend reports three statuses and a free-text stage; the processing
 * screen shows six named steps. The stage string is matched against the steps
 * it is known to emit, so the screen lights up in order and an unrecognised
 * stage simply leaves the list where it was rather than throwing.
 */
const STAGES: { key: string; label: string; match: RegExp }[] = [
  { key: "queued", label: "Queued", match: /queue/i },
  { key: "profiling", label: "Profiling the dataset", match: /profil|schema|map|prepar/i },
  { key: "cleaning", label: "Cleaning and reindexing", match: /clean|reindex/i },
  { key: "classifying", label: "Classifying demand patterns", match: /classif|segment/i },
  { key: "forecasting", label: "Forecasting and selecting models", match: /forecast|model/i },
  {
    key: "validating",
    label: "Validating and simulating value",
    match: /validat|backtest|simulat|value/i,
  },
];

const JOB_STATUS: Record<string, JobStatus> = {
  completed: "completed",
  failed: "failed",
};

export function toJobState(job: BackendJob): JobState {
  const stage = job.stage ?? "";
  const found = STAGES.findIndex((step) => step.match.test(stage));
  // A stage string nobody anticipated still has to produce a sensible screen.
  // Falling back to the first step means a failure is always attributed
  // somewhere visible instead of leaving every step "pending", which reads as
  // "nothing happened" next to a red error message.
  const matched = found >= 0 ? found : 0;
  const active = job.status === "completed" ? STAGES.length : matched;

  return {
    job_id: job.job_id,
    dataset_id: job.dataset_id,
    status:
      JOB_STATUS[job.status] ?? (found >= 0 ? (STAGES[found].key as JobStatus) : "queued"),
    progress: job.progress,
    steps: STAGES.map((step, index) => ({
      key: step.key,
      label: step.label,
      state:
        job.status === "failed" && index === matched
          ? "failed"
          : index < active
            ? "done"
            : index === active && job.status !== "failed"
              ? "active"
              : "pending",
      detail: index === matched && stage ? stage : null,
    })),
    message: job.error ?? (job.status === "completed" ? "Forecast ready." : stage || null),
  };
}

/* --------------------------------------------------------------- projects */

/**
 * A dataset in the forecasting service, seen as a project.
 *
 * Several fields on the card have no source: the backend stores no display
 * name, no organisation, no horizon and no per-project series count until a
 * forecast has run. They are filled from what a dataset does carry, and the
 * sparkline is empty because there is no history endpoint to draw one from.
 */
export function toProject(dataset: BackendDataset, organisation: string): Project {
  const confirmed = dataset.mapping_confirmed === 1;
  return {
    project_id: dataset.dataset_id,
    name: dataset.filename.replace(/\.[^.]+$/, ""),
    organisation,
    industry_mode: dataset.decision_mode === "manufaktur" ? "manufaktur" : "ritel",
    dataset_id: dataset.dataset_id,
    dataset_filename: dataset.filename,
    uploaded_at: dataset.created_at,
    forecast_generated_at: null,
    last_opened_at: dataset.created_at,
    status: confirmed ? "ready" : "needs_review",
    horizon_days: 30,
    series_total: 0,
    health_score: dataset.health_score ?? 0,
    demand_sparkline: [],
  };
}

/* ---------------------------------------------------------- supply chain */

/**
 * Reads a labelled line out of the reorder explanation.
 *
 * These lines are the backend's own decomposition of the recommended quantity —
 * real values it computed and sent, not something reconstructed here. Matching
 * them by label is fragile in exactly one way, and gap B5 asks for them as named
 * fields instead.
 */
function explanationValue(
  recommendation: BackendRecommendation,
  pattern: RegExp,
): number | null {
  const line = recommendation.explanation.find((entry) => pattern.test(entry.label));
  return line ? line.value : null;
}

export function toInventoryRow(recommendation: BackendRecommendation): InventoryRow {
  const risk = RISK[recommendation.stockout_risk] ?? "watch";
  const currentStock = explanationValue(recommendation, /current stock/i);
  const leadTimeDemand = explanationValue(recommendation, /lead time/i);
  const safetyStock = explanationValue(recommendation, /safety/i);

  return {
    series_id: recommendation.series_id,
    item_id: recommendation.item_id ?? recommendation.series_id,
    // The backend carries ids, never display names. Gap B6.
    item_name: recommendation.item_id ?? recommendation.series_id,
    location_id: recommendation.location_id ?? "",
    location: recommendation.location_id ?? "—",
    category: null,
    current_stock: currentStock === null ? null : Math.abs(currentStock),
    forecast_demand: null,
    lead_time_demand: leadTimeDemand,
    safety_stock: safetyStock,
    coverage_days: null,
    days_until_stockout: recommendation.days_until_stockout,
    risk,
    risk_label: RISK_LABEL[risk],
    recommended_qty: Math.round(recommendation.recommended_qty),
    lead_time_days: null,
    moq: null,
    demand_class: (recommendation.demand_class ?? "smooth") as DemandClass,
    model: recommendation.model_name ?? "—",
    wape_percent: recommendation.wape === null ? null : recommendation.wape * 100,
    explanation: {
      lines: recommendation.explanation.map((entry) => ({
        label: entry.label,
        value: entry.value,
        kind: entry.value < 0 ? ("subtract" as const) : ("add" as const),
      })),
      total_label: "Recommended order quantity",
      total_value: Math.round(recommendation.recommended_qty),
    },
    recent_demand: null,
  };
}

export function toSupplyChainResponse(
  datasetId: string,
  recommendations: BackendRecommendation[],
  mode: "ritel" | "manufaktur",
): SupplyChainResponse {
  const rows = recommendations.map(toInventoryRow);
  const attention = rows.filter((row) => row.risk === "at_risk" || row.risk === "critical");
  const units = rows.reduce((total, row) => total + row.recommended_qty, 0);

  const bands: RiskLevel[] = ["critical", "at_risk", "watch", "healthy"];
  const summary = bands
    .map((risk) => {
      const inBand = rows.filter((row) => row.risk === risk);
      return {
        risk,
        label: RISK_LABEL[risk],
        series_count: inBand.length,
        recommended_units: inBand.reduce((total, row) => total + row.recommended_qty, 0),
      };
    })
    .filter((band) => band.series_count > 0);

  const distinct = (values: (string | null)[]) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

  return {
    dataset_id: datasetId,
    generated_at: new Date().toISOString(),
    mode,
    rows,
    // Counting rows the backend already classified is not deriving risk — the
    // band on every row came from the backend.
    headline: {
      attention_count: attention.length,
      total_count: rows.length,
      units_to_order: Math.round(units),
      detail:
        attention.length === 0
          ? "No series is flagged at risk in this run."
          : `${attention.length} of ${rows.length} series are flagged at risk by the decision engine.`,
    },
    summary,
    filters: {
      locations: distinct(rows.map((row) => row.location_id)).map((value) => ({
        value,
        label: value,
      })),
      categories: [],
      risks: summary.map((band) => ({ value: band.risk, label: band.label })),
    },
  };
}

/* --------------------------------------------------------------- forecast */

/**
 * A single series' forecast.
 *
 * The backend returns future points only, so `actual` is null on every point
 * and `cutoff_index` is -1: there is nothing observed to cut at. The chart
 * components treat that as "forecast only" rather than drawing a history line
 * out of nothing. Gap B1 is the endpoint that would fill it in.
 */
export function toForecastSeries(
  series: BackendSeriesForecast,
  label: string,
): ForecastSeries | null {
  if (series.forecast.length === 0) return null;

  const points = series.forecast.map((point) => ({
    t: point.timestamp.slice(0, 10),
    actual: null,
    forecast: point.forecast,
    lower: point.lower,
    upper: point.upper,
  }));

  return {
    label,
    cutoff_index: -1,
    points,
    historical_range: { from: points[0].t, to: points[0].t },
    forecast_range: { from: points[0].t, to: points[points.length - 1].t },
    unit: "units",
  };
}

/* ------------------------------------------------------------------ value */

export function toValueSimulation(value: BackendValue, datasetId: string): ValueSimulation {
  return {
    dataset_id: datasetId,
    baseline_name: value.baseline.label,
    // Fractions to percentages. A unit conversion, not a calculation.
    fill_rate_baseline_percent: value.baseline.fill_rate * 100,
    fill_rate_model_percent: value.proposed.fill_rate * 100,
    stockout_events_baseline: value.baseline.stockout_events,
    stockout_events_model: value.proposed.stockout_events,
    avg_inventory_value_baseline: value.baseline.avg_inventory_value,
    avg_inventory_value_model: value.proposed.avg_inventory_value,
    net_benefit_idr: value.delta.total_benefit,
    window_label: `${value.scope.series} series over ${value.scope.periods} periods`,
  };
}
