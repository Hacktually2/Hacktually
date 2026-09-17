const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type FieldMapping = {
  canonical: string;
  source_column: string | null;
  confidence: number;
  reason: string;
};

export type IngestResult = {
  dataset_id: string;
  rows: number;
  columns: string[];
  preset_matched: string | null;
  mapping: { fields: FieldMapping[]; preset_matched: string | null };
};

export type Finding = { level: "ok" | "warn" | "error"; text: string };

export type Health = {
  health_score: number;
  frequency: string;
  history_start: string | null;
  history_end: string | null;
  periods: number;
  series_total: number;
  series_forecastable: number;
  series_excluded: { series_id: string; reason: string; fix: string }[];
  series_excluded_count: number;
  findings: Finding[];
  demand_portfolio: Record<string, number>;
  censored_series?: number;
  cleaning: Record<string, number | string | string[]>;
};

export type Recommendation = {
  series_id: string;
  item_id: string | null;
  location_id: string | null;
  mode: string;
  stockout_risk: "high" | "medium" | "low";
  days_until_stockout: number | null;
  recommended_qty: number;
  raw_material_qty: number | null;
  demand_class: string | null;
  model_name: string | null;
  wape: number | null;
  reason: string | null;
  explanation: { label: string; value: number }[];
};

export type ValueSim = {
  baseline: Record<string, number | string>;
  proposed: Record<string, number | string>;
  delta: {
    fill_rate_points: number;
    stockout_events_avoided: number;
    lost_sales_units_avoided: number;
    working_capital_freed: number;
    margin_recovered: number;
    total_benefit: number;
  };
  scope: { series: number; periods: number };
};

export type Job = {
  job_id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  stage: string | null;
  error: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  base: BASE,

  health: () => request<{ status: string; timesfm: { available: boolean } }>("/health"),

  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<IngestResult>("/api/v1/ingest", { method: "POST", body: form });
  },

  getMapping: (id: string) =>
    request<{ mapping: { fields: FieldMapping[] }; preset_matched: string | null; filename: string }>(
      `/api/v1/datasets/${id}/mapping`,
    ),

  confirmMapping: (id: string, overrides: Record<string, string>) =>
    request<{ health: Health }>(`/api/v1/datasets/${id}/mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    }),

  getHealth: (id: string) => request<Health>(`/api/v1/datasets/${id}/health`),

  startForecast: (id: string, horizon: number, mode: string) =>
    request<{ job_id: string }>(`/api/v1/datasets/${id}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horizon, mode, use_calendar: true }),
    }),

  getJob: (jobId: string) => request<Job>(`/api/v1/jobs/${jobId}`),

  getRecommendations: (id: string, limit = 50) =>
    request<{ recommendations: Recommendation[] }>(
      `/api/v1/recommendations/${id}?limit=${limit}`,
    ),

  getForecasts: (id: string) =>
    request<{ model_mix: Record<string, number>; series: Record<string, unknown>[] }>(
      `/api/v1/forecasts/${id}`,
    ),

  getSeries: (id: string, seriesId: string) =>
    request<{
      forecast: { timestamp: string; forecast: number; lower: number; upper: number }[];
      selection: Record<string, unknown> | null;
      candidates: Record<string, { wape: number; mase: number; bias: number }>;
      profile: Record<string, unknown> | null;
    }>(`/api/v1/forecasts/${id}/${encodeURIComponent(seriesId)}`),

  getValue: (id: string) => request<ValueSim>(`/api/v1/value/${id}`),

  getUsage: (id: string) =>
    request<{ series_forecast: number; forecast_points: number; model_invocations: number }>(
      `/api/v1/usage/${id}`,
    ),

  sendAlert: (id: string, seriesIds: string[]) =>
    request<{ sent: boolean; message: string; reason?: string }>("/api/v1/alerts/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: id, series_ids: seriesIds, limit: 5 }),
    }),
};

export const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export const number = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
