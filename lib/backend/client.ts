import "server-only";

/**
 * The only place this app talks to the forecasting backend.
 *
 * Everything goes through `request`, so timeouts, error translation and the
 * "is it even up" question are answered once. Callers get either a value or a
 * `BackendError` carrying enough to render a useful message — never a bare
 * `fetch` rejection.
 *
 * Most calls are now typed directly to the types in `app/dummy-data/types.ts`,
 * because that is what the service returns. Nothing is reshaped on the way
 * through: a screen renders what the backend sent.
 *
 * Server-only: the backend has no auth of its own, so the browser must never
 * hold its address or call it directly. Every read is proxied through a Server
 * Component or Server Action that has already checked branch access.
 */
import type {
  DemandResponse,
  HealthReport,
  MappingResponse,
  OverviewResponse,
  Project,
  SupplyChainResponse,
  ValueSimulation,
} from "@/app/dummy-data/types";
import type {
  BackendBranches,
  BackendHierarchy,
  BackendDataset,
  BackendForecastList,
  BackendHealthCheck,
  BackendIngestResult,
  BackendJob,
  BackendParams,
  BackendSeriesForecast,
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

  /* ---- project chooser -------------------------------------------------- */

  listProjects: () => request<Project[]>("/api/v1/projects"),

  getProject: (projectId: string) => request<Project>(`/api/v1/projects/${projectId}`),

  /** The raw dataset list. `listProjects` is the read model built on top of it. */
  listDatasets: () => request<BackendDataset[]>("/api/v1/datasets"),

  /* ---- onboarding ------------------------------------------------------- */

  ingest: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<BackendIngestResult>("/api/v1/ingest", { method: "POST", body: form });
  },

  getMapping: (datasetId: string) =>
    request<MappingResponse>(`/api/v1/datasets/${datasetId}/mapping`),

  /**
   * Confirming also runs cleaning and profiling, so this is slow and it returns
   * the health report as part of the same response.
   */
  confirmMapping: (datasetId: string, overrides: Record<string, string>, sourceId?: string) =>
    request<{ dataset_id: string; confirmed: boolean; health: HealthReport }>(
      `/api/v1/datasets/${datasetId}/mapping`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, source_id: sourceId ?? null }),
      },
    ),

  getHealth: (datasetId: string) =>
    request<HealthReport>(`/api/v1/datasets/${datasetId}/health`),

  /** Adds another branch's export, each keeping its own column mapping. */
  appendSource: (datasetId: string, file: File, branchLabel?: string) => {
    const form = new FormData();
    form.append("file", file);
    const query = branchLabel ? `?branch_label=${encodeURIComponent(branchLabel)}` : "";
    return request<Record<string, unknown>>(
      `/api/v1/datasets/${datasetId}/append${query}`,
      { method: "POST", body: form },
    );
  },

  listSources: (datasetId: string) =>
    request<{ dataset_id: string; sources: Record<string, unknown>[] }>(
      `/api/v1/datasets/${datasetId}/sources`,
    ),

  /* ---- jobs ------------------------------------------------------------- */

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

  /* ---- dashboards ------------------------------------------------------- */

  // `location` scopes the whole response to one branch. The backend has
  // supported it since B11; this client did not pass it, which meant a dataset
  // holding several branches could only ever be read as one lump.
  getOverview: (datasetId: string, location?: string) =>
    request<OverviewResponse>(
      `/api/v1/overview/${datasetId}${location ? `?location=${encodeURIComponent(location)}` : ""}`,
    ),

  getDemand: (datasetId: string, filters: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query}` : "";
    return request<DemandResponse>(`/api/v1/demand/${datasetId}${suffix}`);
  },

  /**
   * The decision engine's output, already in the shape the inventory workspace
   * renders. `location_id` is accepted but currently ignored by the service —
   * see gap B11.
   */
  getRecommendations: (datasetId: string, limit = 500, locationId?: string) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (locationId) query.set("location_id", locationId);
    return request<SupplyChainResponse>(
      `/api/v1/recommendations/${datasetId}?${query}`,
    );
  },

  getValue: (datasetId: string) =>
    request<ValueSimulation>(`/api/v1/value/${datasetId}`),

  listForecasts: (datasetId: string, limit = 500) =>
    request<BackendForecastList>(`/api/v1/forecasts/${datasetId}?limit=${limit}`),

  getSeriesForecast: (datasetId: string, seriesId: string) =>
    request<BackendSeriesForecast>(
      `/api/v1/forecasts/${datasetId}/${encodeURIComponent(seriesId)}`,
    ),

  /* ---- parameters, branches, alerts ------------------------------------ */

  getParams: (datasetId: string) =>
    request<BackendParams>(`/api/v1/datasets/${datasetId}/params`),

  setParams: (
    datasetId: string,
    entries: { scope: string; scope_value: string; values: Record<string, number> }[],
  ) =>
    request<Record<string, unknown>>(`/api/v1/datasets/${datasetId}/params`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }),

  getBranches: (datasetId: string) =>
    request<BackendBranches>(`/api/v1/branches/${datasetId}`),

  getHierarchy: (datasetId: string) =>
    request<BackendHierarchy>(`/api/v1/datasets/${datasetId}/hierarchy`),

  sendSlackAlert: (datasetId: string, seriesIds: string[], limit = 5) =>
    request<{ sent: boolean; message?: string; reason?: string }>("/api/v1/alerts/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_id: datasetId, series_ids: seriesIds, limit }),
    }),
};
