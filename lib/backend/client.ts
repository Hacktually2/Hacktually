import "server-only";

/**
 * The only place this app talks to the forecasting backend.
 *
 * Everything goes through `request`, so timeouts, error translation and the
 * "is it even up" question are answered once. Callers get either a value or a
 * `BackendError` carrying enough to render a useful message and to write a
 * line in the migration report — never a bare `fetch` rejection.
 *
 * Server-only: the backend has no auth of its own, so the browser must never
 * hold its address or call it directly. Every read is proxied through a Server
 * Component or Server Action that has already checked branch access.
 */
import type {
  BackendDataset,
  BackendForecastList,
  BackendHealth,
  BackendHealthCheck,
  BackendIngestResult,
  BackendJob,
  BackendMappingResponse,
  BackendRecommendation,
  BackendSeriesForecast,
  BackendUsage,
  BackendValue,
} from "./types";

export const BACKEND_URL = process.env.BACKEND_API_URL ?? "http://localhost:8000";

/** Generous enough for a cold pipeline, short enough that a page still renders. */
const TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS ?? 15_000);

export type BackendFailure =
  | "unreachable"
  | "timeout"
  | "not_found"
  | "bad_request"
  | "server_error"
  | "malformed";

export class BackendError extends Error {
  constructor(
    readonly kind: BackendFailure,
    readonly path: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BackendError";
  }

  /** One sentence a planner can act on, not a stack trace. */
  get userMessage(): string {
    switch (this.kind) {
      case "unreachable":
        return "The forecasting service is not responding.";
      case "timeout":
        return "The forecasting service took too long to answer.";
      case "not_found":
        return "The forecasting service has no record of this dataset.";
      case "bad_request":
        return this.message;
      case "malformed":
        return "The forecasting service returned something this app could not read.";
      default:
        return "The forecasting service reported an error.";
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      // Forecasts and recommendations change whenever a job runs. Caching them
      // would show a planner yesterday's decision with today's timestamp.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new BackendError(
      timedOut ? "timeout" : "unreachable",
      path,
      timedOut
        ? `No answer from ${BACKEND_URL} within ${TIMEOUT_MS}ms`
        : `Could not reach ${BACKEND_URL}: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (!response.ok) {
    // FastAPI puts the useful part in `detail`, which may itself be a list of
    // validation errors rather than a string.
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* a non-JSON error body is not worth a second failure */
    }

    const kind: BackendFailure =
      response.status === 404
        ? "not_found"
        : response.status >= 500
          ? "server_error"
          : "bad_request";
    throw new BackendError(kind, path, detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new BackendError("malformed", path, "Response body was not valid JSON");
  }
}

/* ------------------------------------------------------------------- calls */

export const backend = {
  url: BACKEND_URL,

  health: () => request<BackendHealthCheck>("/health"),

  listDatasets: () => request<BackendDataset[]>("/api/v1/datasets"),

  ingest: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<BackendIngestResult>("/api/v1/ingest", { method: "POST", body: form });
  },

  getMapping: (datasetId: string) =>
    request<BackendMappingResponse>(`/api/v1/datasets/${datasetId}/mapping`),

  /**
   * Confirming also runs cleaning and profiling, so this is slow and it returns
   * the health report as part of the same response.
   */
  confirmMapping: (datasetId: string, overrides: Record<string, string>) =>
    request<BackendMappingResponse>(`/api/v1/datasets/${datasetId}/mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    }),

  getHealth: (datasetId: string) =>
    request<BackendHealth>(`/api/v1/datasets/${datasetId}/health`),

  startForecast: (datasetId: string, horizon = 30, mode = "ritel") =>
    request<{ job_id: string; status: string }>(
      `/api/v1/datasets/${datasetId}/forecast`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon, use_calendar: true, mode }),
      },
    ),

  getJob: (jobId: string) => request<BackendJob>(`/api/v1/jobs/${jobId}`),

  listForecasts: (datasetId: string, limit = 500) =>
    request<BackendForecastList>(`/api/v1/forecasts/${datasetId}?limit=${limit}`),

  getSeriesForecast: (datasetId: string, seriesId: string) =>
    request<BackendSeriesForecast>(
      `/api/v1/forecasts/${datasetId}/${encodeURIComponent(seriesId)}`,
    ),

  getRecommendations: (datasetId: string, limit = 200, risk?: string) =>
    request<{ dataset_id: string; recommendations: BackendRecommendation[] }>(
      `/api/v1/recommendations/${datasetId}?limit=${limit}${risk ? `&risk=${risk}` : ""}`,
    ),

  getValue: (datasetId: string) => request<BackendValue>(`/api/v1/value/${datasetId}`),

  getUsage: (datasetId: string) => request<BackendUsage>(`/api/v1/usage/${datasetId}`),

  sendSlackAlert: (datasetId: string, seriesIds: string[], limit = 5) =>
    request<{ sent: boolean; message?: string; reason?: string }>("/api/v1/alerts/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: datasetId, series_ids: seriesIds, limit }),
    }),
};
