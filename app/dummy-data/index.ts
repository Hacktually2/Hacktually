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
import { buildDemandResponse } from "./demand";
import { HEALTH, JOB_COMPLETED, JOB_SEQUENCE, MAPPING } from "./onboarding";
import { OVERVIEW, VALUE_SIMULATION } from "./overview";
import { DEFAULT_PROJECT_ID, PROJECTS } from "./projects";
import { buildSupplyChainResponse, type SupplyChainFilters } from "./supply-chain";
import type {
  DemandResponse,
  HealthReport,
  JobState,
  MappingResponse,
  OverviewResponse,
  Project,
  SupplyChainResponse,
  ValueSimulation,
} from "./types";

/** GET /api/v1/projects */
export async function getProjects(): Promise<Project[]> {
  return PROJECTS;
}

/** GET /api/v1/projects/{projectId} */
export async function getProject(projectId: string): Promise<Project | undefined> {
  return PROJECTS.find((p) => p.project_id === projectId);
}

/** GET /api/v1/datasets/{id}/mapping */
export async function getMapping(_datasetId: string): Promise<MappingResponse> {
  return MAPPING;
}

/** GET /api/v1/datasets/{id}/health */
export async function getHealth(_datasetId: string): Promise<HealthReport> {
  return HEALTH;
}

/** GET /api/v1/jobs/{job_id} */
export async function getJob(_jobId: string): Promise<JobState> {
  return JOB_COMPLETED;
}

/** The staged sequence the processing screen animates through. */
export async function getJobSequence(): Promise<JobState[]> {
  return JOB_SEQUENCE;
}

/** GET /api/v1/overview/{dataset_id} */
export async function getOverview(_datasetId: string): Promise<OverviewResponse> {
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
  return buildDemandResponse(filters);
}

/** GET /api/v1/recommendations/{dataset_id}?risk=&location=&category= */
export async function getSupplyChain(
  _datasetId: string,
  filters: SupplyChainFilters = {}
): Promise<SupplyChainResponse> {
  return buildSupplyChainResponse(filters);
}

/** GET /api/v1/value/{dataset_id} */
export async function getValueSimulation(_datasetId: string): Promise<ValueSimulation> {
  return VALUE_SIMULATION;
}

export { DEFAULT_PROJECT_ID };
export * from "./types";
