import type { HealthReport, JobState, MappingResponse } from "./types";

/** GET /api/v1/datasets/{id}/mapping */
export const MAPPING: MappingResponse = {
  dataset_id: "ds_8f21c4",
  preset_matched: "Accurate Online — Sales Detail export",
  overall_confidence: "high",
  unmapped_columns: ["no_faktur", "nama_sales", "ppn"],
  fields: [
    {
      source_column: "tgl_order",
      detected_field: "Date",
      canonical_key: "timestamp",
      confidence: "high",
      confidence_score: 0.99,
      resolved_by: "preset",
      reasoning:
        "Matched the Accurate Online export fingerprint. Values parse as dates at a daily interval with no gaps.",
      sample_values: ["2026-09-14", "2026-09-15", "2026-09-16"],
      required: true,
      alternatives: [{ canonical_key: "ignore", label: "Do not use this column" }],
    },
    {
      source_column: "kode_barang",
      detected_field: "Product ID",
      canonical_key: "item_id",
      confidence: "high",
      confidence_score: 0.97,
      resolved_by: "preset",
      reasoning:
        "428 distinct values with a stable alphanumeric pattern, repeated across the full history.",
      sample_values: ["SRM-450", "KCG-200", "MSD-70"],
      required: true,
      alternatives: [
        { canonical_key: "category", label: "Category" },
        { canonical_key: "ignore", label: "Do not use this column" },
      ],
    },
    {
      source_column: "qty_out",
      detected_field: "Demand Quantity",
      canonical_key: "target",
      confidence: "medium",
      confidence_score: 0.74,
      resolved_by: "rule",
      reasoning:
        "Numeric, non-negative in 99.9% of rows, and moves with transaction frequency. The dataset also contains qty_retur, which could be the intended quantity instead.",
      sample_values: ["12", "25", "9"],
      required: true,
      alternatives: [
        { canonical_key: "inventory", label: "Inventory on hand" },
        { canonical_key: "ignore", label: "Do not use this column" },
      ],
    },
    {
      source_column: "cabang",
      detected_field: "Location",
      canonical_key: "location_id",
      confidence: "high",
      confidence_score: 0.95,
      resolved_by: "preset",
      reasoning: "Six distinct values matching known branch codes, present on every row.",
      sample_values: ["JKT-01", "SBY-02", "MDN-01"],
      required: false,
      alternatives: [{ canonical_key: "ignore", label: "Do not use this column" }],
    },
    {
      source_column: "harga_satuan",
      detected_field: "Unit Price",
      canonical_key: "price",
      confidence: "high",
      confidence_score: 0.92,
      resolved_by: "rule",
      reasoning: "Currency-scaled values that stay constant within each product across time.",
      sample_values: ["83500", "12000", "3500"],
      required: false,
      alternatives: [{ canonical_key: "ignore", label: "Do not use this column" }],
    },
    {
      source_column: "stok_akhir",
      detected_field: "Inventory",
      canonical_key: "inventory",
      confidence: "medium",
      confidence_score: 0.68,
      resolved_by: "model",
      reasoning:
        "Declines between replenishments and resets upward periodically, which is consistent with closing stock. It is also non-monotonic in 4% of series.",
      sample_values: ["1700", "840", "312"],
      required: false,
      alternatives: [
        { canonical_key: "target", label: "Demand quantity" },
        { canonical_key: "ignore", label: "Do not use this column" },
      ],
    },
    {
      source_column: "lead_time_hari",
      detected_field: "Lead Time",
      canonical_key: "lead_time",
      confidence: "high",
      confidence_score: 0.9,
      resolved_by: "rule",
      reasoning: "Small integers, constant per supplier, named in a recognised pattern.",
      sample_values: ["7", "14", "45"],
      required: false,
      alternatives: [{ canonical_key: "ignore", label: "Do not use this column" }],
    },
  ],
};

/** GET /api/v1/datasets/{id}/health */
export const HEALTH: HealthReport = {
  dataset_id: "ds_8f21c4",
  rows_received: 154239,
  duplicates_found: 193,
  missing_timestamps: 82,
  negative_values: 7,
  series_total: 428,
  series_forecastable: 417,
  detected_frequency: "Daily",
  history_span_months: 21,
  health_score: 82,
  // All 11, so the list agrees with series_total − series_forecastable and with
  // the "11 series are not forecastable" finding below.
  series_excluded: [
    { series_id: "ABC-120__JKT-01", reason: "Only 6 weeks of history" },
    { series_id: "XYZ-880__BDG-01", reason: "Only 3 weeks of history" },
    { series_id: "QRS-041__MDN-01", reason: "No non-zero demand in the last 12 months" },
    { series_id: "LMN-233__SMG-01", reason: "Only 4 weeks of history" },
    { series_id: "TUV-556__SBY-02", reason: "Only 5 weeks of history" },
    { series_id: "GHI-702__JKT-02", reason: "No non-zero demand in the last 12 months" },
    { series_id: "DEF-318__BDG-01", reason: "Only 2 weeks of history" },
    { series_id: "JKL-091__MDN-01", reason: "Only 7 weeks of history" },
    { series_id: "NOP-447__SMG-01", reason: "Only 3 weeks of history" },
    { series_id: "RST-829__JKT-01", reason: "Discontinued in Mar 2026" },
    { series_id: "UVW-163__SBY-02", reason: "Discontinued in Jun 2026" },
  ],
  findings: [
    {
      id: "censored",
      severity: "warning",
      title: "Demand was censored in 38 series",
      detail:
        "Stock reached zero while sales stayed flat at a ceiling. Recorded sales understate real demand in those periods, so they are masked from model fitting and reported separately.",
      action: "Review the affected series in Demand & Sales",
    },
    {
      id: "duplicates",
      severity: "info",
      title: "193 duplicate rows aggregated",
      detail:
        "Rows sharing the same timestamp and series were summed rather than dropped, which matches how the source system records split invoices.",
      action: null,
    },
    {
      id: "gaps",
      severity: "info",
      title: "82 missing dates reindexed",
      detail:
        "The time axis was completed at the detected daily frequency. Missing dates are treated as zero demand, not as absent observations.",
      action: null,
    },
    {
      id: "returns",
      severity: "info",
      title: "7 negative quantities flagged as returns",
      detail: "These rows are excluded from model fitting and retained in the audit trail.",
      action: null,
    },
    {
      id: "excluded",
      severity: "warning",
      title: "11 series are not forecastable",
      detail:
        "Each has too little history to validate a model against. They remain visible in the dashboard but carry no forecast.",
      action: "See the excluded list",
    },
  ],
};

/** GET /api/v1/jobs/{job_id} — the terminal state for the ready project. */
export const JOB_COMPLETED: JobState = {
  job_id: "job_5a1c90",
  dataset_id: "ds_8f21c4",
  status: "completed",
  progress: 100,
  message: null,
  steps: [
    { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
    { key: "profile", label: "Schema detected", state: "done", detail: "Accurate Online preset matched" },
    { key: "clean", label: "Data quality checked", state: "done", detail: "Health score 82" },
    { key: "classify", label: "Demand patterns classified", state: "done", detail: "428 series" },
    { key: "forecast", label: "Forecasts generated", state: "done", detail: "30-day horizon" },
    { key: "validate", label: "Forecasts validated", state: "done", detail: "2 rolling windows" },
    { key: "decide", label: "Inventory analysis prepared", state: "done", detail: "5 actions raised" },
  ],
};

/**
 * Staged job states for the processing screen. The screen walks this sequence
 * so the demo shows real progress semantics rather than a fake spinner.
 * In production this is one poll per state against GET /api/v1/jobs/{job_id}.
 */
export const JOB_SEQUENCE: JobState[] = [
  {
    job_id: "job_5a1c90",
    dataset_id: "ds_8f21c4",
    status: "profiling",
    progress: 14,
    message: "Reading 154,239 rows",
    steps: [
      { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
      { key: "profile", label: "Detecting schema", state: "active", detail: null },
      { key: "clean", label: "Checking data quality", state: "pending", detail: null },
      { key: "classify", label: "Classifying demand patterns", state: "pending", detail: null },
      { key: "forecast", label: "Generating forecasts", state: "pending", detail: null },
      { key: "validate", label: "Validating forecasts", state: "pending", detail: null },
      { key: "decide", label: "Preparing inventory analysis", state: "pending", detail: null },
    ],
  },
  {
    job_id: "job_5a1c90",
    dataset_id: "ds_8f21c4",
    status: "cleaning",
    progress: 32,
    message: "Reindexing to a complete daily axis",
    steps: [
      { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
      { key: "profile", label: "Schema detected", state: "done", detail: "Accurate Online preset matched" },
      { key: "clean", label: "Checking data quality", state: "active", detail: null },
      { key: "classify", label: "Classifying demand patterns", state: "pending", detail: null },
      { key: "forecast", label: "Generating forecasts", state: "pending", detail: null },
      { key: "validate", label: "Validating forecasts", state: "pending", detail: null },
      { key: "decide", label: "Preparing inventory analysis", state: "pending", detail: null },
    ],
  },
  {
    job_id: "job_5a1c90",
    dataset_id: "ds_8f21c4",
    status: "classifying",
    progress: 48,
    message: "Segmenting 428 series by demand pattern",
    steps: [
      { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
      { key: "profile", label: "Schema detected", state: "done", detail: "Accurate Online preset matched" },
      { key: "clean", label: "Data quality checked", state: "done", detail: "Health score 82" },
      { key: "classify", label: "Classifying demand patterns", state: "active", detail: null },
      { key: "forecast", label: "Generating forecasts", state: "pending", detail: null },
      { key: "validate", label: "Validating forecasts", state: "pending", detail: null },
      { key: "decide", label: "Preparing inventory analysis", state: "pending", detail: null },
    ],
  },
  {
    job_id: "job_5a1c90",
    dataset_id: "ds_8f21c4",
    status: "forecasting",
    progress: 71,
    message: "Forecasting 417 series over a 30-day horizon",
    steps: [
      { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
      { key: "profile", label: "Schema detected", state: "done", detail: "Accurate Online preset matched" },
      { key: "clean", label: "Data quality checked", state: "done", detail: "Health score 82" },
      { key: "classify", label: "Demand patterns classified", state: "done", detail: "428 series" },
      { key: "forecast", label: "Generating forecasts", state: "active", detail: null },
      { key: "validate", label: "Validating forecasts", state: "pending", detail: null },
      { key: "decide", label: "Preparing inventory analysis", state: "pending", detail: null },
    ],
  },
  {
    job_id: "job_5a1c90",
    dataset_id: "ds_8f21c4",
    status: "validating",
    progress: 89,
    message: "Backtesting candidates across 2 rolling windows",
    steps: [
      { key: "upload", label: "File received", state: "done", detail: "154,239 rows · 18.4 MB" },
      { key: "profile", label: "Schema detected", state: "done", detail: "Accurate Online preset matched" },
      { key: "clean", label: "Data quality checked", state: "done", detail: "Health score 82" },
      { key: "classify", label: "Demand patterns classified", state: "done", detail: "428 series" },
      { key: "forecast", label: "Forecasts generated", state: "done", detail: "30-day horizon" },
      { key: "validate", label: "Validating forecasts", state: "active", detail: null },
      { key: "decide", label: "Preparing inventory analysis", state: "pending", detail: null },
    ],
  },
  JOB_COMPLETED,
];
