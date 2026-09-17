/**
 * The frontend's only data source while the backend is being built.
 *
 * Every accessor is async and returns exactly what the corresponding REST
 * endpoint is contracted to return, so switching to the real service is a
 * one-file change: replace the body with `fetch(...)`. Nothing else in the app
 * needs to know.
 *
 * Endpoint mapping is noted on each function.
 */
import { ACTIVITY } from "./activity";
import { buildDemandResponse } from "./demand";
import { MERGE_PREVIEW } from "./merge";
import { SERIES_DETAIL } from "./series-detail";
import { HEALTH, JOB_COMPLETED, JOB_SEQUENCE, MAPPING } from "./onboarding";
import { OVERVIEW, VALUE_SIMULATION } from "./overview";
import { PLANNING_PARAMETERS } from "./parameters";
import { DEFAULT_PROJECT_ID, PROJECTS } from "./projects";
import { buildSupplyChainResponse, type SupplyChainFilters } from "./supply-chain";
import type {
  ActivityEvent,
  DemandResponse,
  ForecastSeries,
  HealthReport,
  JobState,
  MappingResponse,
  MergePreview,
  PlanningParameters,
  OverviewResponse,
  Project,
  SupplyChainResponse,
  ValueSimulation,
} from "./types";

/**
 * Optional stand-in for network latency.
 *
 * The fixtures resolve instantly, so every loading state would be invisible and
 * therefore untestable and undemoable. Set DEMO_LATENCY_MS to make the wait
 * real: the skeletons in each loading.tsx then behave exactly as they will
 * against the live API.
 *
 * Defaults to 0, so it costs nothing unless someone asks for it.
 */
const LATENCY = Number(process.env.DEMO_LATENCY_MS ?? 0);

function settle(): Promise<void> | undefined {
  if (!LATENCY) return;
  return new Promise((resolve) => setTimeout(resolve, LATENCY));
}

/** GET /api/v1/projects */
export async function getProjects(): Promise<Project[]> {
  await settle();
  return PROJECTS;
}

/** GET /api/v1/projects/{projectId} */
export async function getProject(projectId: string): Promise<Project | undefined> {
  await settle();
  return PROJECTS.find((p) => p.project_id === projectId);
}

/** GET /api/v1/datasets/{id}/mapping */
export async function getMapping(_datasetId: string): Promise<MappingResponse> {
  await settle();
  return MAPPING;
}

/** GET /api/v1/datasets/{id}/health */
export async function getHealth(_datasetId: string): Promise<HealthReport> {
  await settle();
  return HEALTH;
}

/** GET /api/v1/jobs/{job_id} */
export async function getJob(_jobId: string): Promise<JobState> {
  await settle();
  return JOB_COMPLETED;
}

/** The staged sequence the processing screen animates through. */
export async function getJobSequence(): Promise<JobState[]> {
  await settle();
  return JOB_SEQUENCE;
}

/** GET /api/v1/overview/{dataset_id} */
export async function getOverview(_datasetId: string): Promise<OverviewResponse> {
  await settle();
  return OVERVIEW;
}

/**
 * GET /api/v1/demand/{dataset_id}?date_range=&product=&location=&compare=
 *
 * Filtering is the backend's job, so it is applied here rather than in a
 * component. The real endpoint does the same work against SQLite.
 */
export async function getDemand(
  _datasetId: string,
  filters: Partial<DemandResponse["active_filters"]> = {}
): Promise<DemandResponse> {
  await settle();
  return buildDemandResponse(filters);
}

/** GET /api/v1/recommendations/{dataset_id}?risk=&location=&category= */
export async function getSupplyChain(
  _datasetId: string,
  filters: SupplyChainFilters = {}
): Promise<SupplyChainResponse> {
  await settle();
  return buildSupplyChainResponse(filters);
}

/**
 * NEEDS-ENDPOINT: GET /api/v1/activity?project_id=
 * Newest first. Omitting the project id returns activity across all projects.
 */
export async function getActivity(projectId?: string): Promise<ActivityEvent[]> {
  await settle();
  return projectId ? ACTIVITY.filter((e) => e.project_id === projectId) : ACTIVITY;
}

/**
 * NEEDS-ENDPOINT: POST /api/v1/datasets/{id}/append?dry_run=true
 * Dry run only. Nothing is written until the user confirms.
 */
export async function getMergePreview(
  _datasetId: string,
  filename: string
): Promise<MergePreview> {
  await settle();
  return { ...MERGE_PREVIEW, incoming_filename: filename };
}

/**
 * GET /api/v1/forecasts/{dataset_id}/{series}
 *
 * One series with its own history. Already in the frozen contract, so the
 * product filter on Demand & Sales narrows the chart itself rather than showing
 * the portfolio aggregate with a caveat attached.
 */
export async function getSeriesDetail(
  _datasetId: string,
  seriesId: string
): Promise<ForecastSeries | null> {
  await settle();
  const detail = SERIES_DETAIL[seriesId];
  if (!detail) return null;
  const cutoff = detail.points.findIndex((p, i) => p.actual !== null && detail.points[i + 1]?.actual == null);
  return {
    label: `${detail.item_name} · ${detail.location}`,
    cutoff_index: cutoff,
    points: detail.points,
    historical_range: { from: detail.points[0].t, to: detail.points[cutoff].t },
    forecast_range: {
      from: detail.points[cutoff + 1].t,
      to: detail.points[detail.points.length - 1].t,
    },
    unit: "units",
  };
}

/** NEEDS-ENDPOINT: GET /api/v1/datasets/{id}/parameters */
export async function getPlanningParameters(
  _datasetId: string
): Promise<PlanningParameters> {
  await settle();
  return PLANNING_PARAMETERS;
}

/** GET /api/v1/value/{dataset_id} */
export async function getValueSimulation(_datasetId: string): Promise<ValueSimulation> {
  await settle();
  return VALUE_SIMULATION;
}

export { DEFAULT_PROJECT_ID };
export * from "./types";
