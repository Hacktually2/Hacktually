/**
 * The app's data layer, now wired to the real forecasting backend.
 *
 * This is the file `frontend-backend-integration.md` promised would be the only
 * one to change, and it was — every accessor still returns exactly what the
 * screens expect. What changed is that each one now returns a `Sourced<T>`:
 * the value, plus whether it came from the live service or from a fixture, plus
 * why. Screens render a badge when it is not live.
 *
 * Three states, and each accessor is in exactly one of them:
 *
 *   LIVE       the backend has the endpoint. Fixtures are the fallback if the
 *              service is down, never the default.
 *   NOT BUILT  the backend has no such endpoint. The fixture is the only
 *              source, and the note names the endpoint that would replace it.
 *   PARTIAL    the endpoint exists but cannot fill every field. It is live,
 *              and the missing fields arrive as null.
 *
 * Every NOT BUILT and PARTIAL here is a numbered gap in migration-report.md.
 */
import { backend } from "@/lib/backend/client";
import {
  toHealthReport,
  toJobState,
  toMappingResponse,
  toProject,
  toSupplyChainResponse,
  toValueSimulation,
} from "@/lib/backend/adapters";
import { fromBackend, notBuilt, type Sourced } from "@/lib/backend/source";
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

/**
 * PARTIAL — GET /api/v1/datasets
 *
 * The backend has no project concept, only datasets. A dataset carries enough
 * for a card to exist but not enough to fill one: no display name beyond the
 * filename, no organisation, no series count, no sparkline. Gap B7.
 *
 * Live datasets come first; the seeded fixture branches stay appended so the
 * demo network is always reachable even with the service down.
 */
export async function getProjects(organisation = "PT ABC Distribution"): Promise<Sourced<Project[]>> {
  await settle();
  const sourced = await fromBackend(
    async () => {
      const datasets = await backend.listDatasets();
      return datasets.map((dataset) => toProject(dataset, organisation));
    },
    () => [],
  );
  // Fixtures are additive here rather than a replacement: they are the seeded
  // branch network, which is demo data by design, not a failed live read.
  return { ...sourced, data: [...sourced.data, ...PROJECTS] };
}

/**
 * One project, and the difference between "no such thing" and "could not ask".
 *
 * If the service answered and does not have this dataset, it does not exist and
 * the page 404s. If the service could not be reached, 404 would be a lie — the
 * dataset was there a minute ago — so the screens render in fallback mode
 * against a placeholder and their badges explain why the numbers are demo data.
 * Without this, one blip turns every live dashboard into "page not found".
 */
export async function getProject(projectId: string): Promise<Project | undefined> {
  const fixture = PROJECTS.find((p) => p.project_id === projectId);
  if (fixture) return fixture;

  const { data, live } = await getProjects();
  const found = data.find((p) => p.project_id === projectId);
  if (found) return found;
  if (live) return undefined;

  return {
    project_id: projectId,
    name: projectId,
    organisation: "Unavailable",
    industry_mode: "ritel",
    dataset_id: projectId,
    dataset_filename: "—",
    uploaded_at: new Date().toISOString(),
    forecast_generated_at: null,
    last_opened_at: new Date().toISOString(),
    status: "processing",
    horizon_days: 30,
    series_total: 0,
    health_score: 0,
    demand_sparkline: [],
  };
}

/** LIVE — GET /api/v1/datasets/{id}/mapping. Missing sample values, gap B2. */
export async function getMapping(datasetId: string): Promise<Sourced<MappingResponse>> {
  await settle();
  return fromBackend(
    async () => toMappingResponse(await backend.getMapping(datasetId)),
    () => MAPPING,
  );
}

/** LIVE — GET /api/v1/datasets/{id}/health. */
export async function getHealth(datasetId: string): Promise<Sourced<HealthReport>> {
  await settle();
  return fromBackend(
    async () => toHealthReport(await backend.getHealth(datasetId), datasetId),
    () => HEALTH,
  );
}

/** LIVE — GET /api/v1/jobs/{job_id}. Steps are inferred from `stage`, gap B8. */
export async function getJob(jobId: string): Promise<Sourced<JobState>> {
  return fromBackend(
    async () => toJobState(await backend.getJob(jobId)),
    () => JOB_COMPLETED,
  );
}

/**
 * The staged sequence the processing screen animates through when there is no
 * real job to poll — an existing fixture project, or a page opened after the
 * job id was lost. A live run polls `getJob` instead.
 */
export async function getJobSequence(): Promise<JobState[]> {
  await settle();
  return JOB_SEQUENCE;
}

/** NOT BUILT — gap B9. No endpoint composes the situational overview. */
export async function getOverview(_datasetId: string): Promise<Sourced<OverviewResponse>> {
  await settle();
  return notBuilt(OVERVIEW, "GET /api/v1/overview/{dataset_id}");
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
): Promise<Sourced<DemandResponse>> {
  await settle();
  // NOT BUILT — gap B10. Even the pieces that exist (model mix, per-series
  // accuracy) cannot make this screen without history: every chart on it draws
  // actuals against forecast, and gap B1 means there are no actuals to draw.
  return notBuilt(buildDemandResponse(filters), "GET /api/v1/demand/{dataset_id}");
}

/**
 * LIVE — GET /api/v1/recommendations/{dataset_id}
 *
 * The real decision engine's output. Rows are genuine; several columns arrive
 * null because a recommendation carries ids and a reorder decomposition but no
 * item names, categories, coverage or lead times. Gaps B5 and B6.
 *
 * Filtering happens here because the endpoint only accepts `risk`, so location
 * and category narrowing is applied to the rows after they arrive. That is
 * display filtering, not a security boundary — see gap B11 for why that matters
 * for branch managers.
 */
export async function getSupplyChain(
  datasetId: string,
  filters: SupplyChainFilters = {},
  mode: "ritel" | "manufaktur" = "ritel"
): Promise<Sourced<SupplyChainResponse>> {
  await settle();
  return fromBackend(
    async () => {
      const { recommendations } = await backend.getRecommendations(datasetId, 200);
      const response = toSupplyChainResponse(datasetId, recommendations, mode);
      const rows = response.rows.filter(
        (row) =>
          (!filters.risk || filters.risk === "all" || row.risk === filters.risk) &&
          (!filters.location ||
            filters.location === "all" ||
            row.location_id === filters.location)
      );
      return { ...response, rows };
    },
    () => buildSupplyChainResponse(filters)
  );
}

/**
 * NEEDS-ENDPOINT: GET /api/v1/activity?project_id=
 * Newest first. Omitting the project id returns activity across all projects.
 */
export async function getActivity(projectId?: string): Promise<ActivityEvent[]> {
  await settle();
  // NOT BUILT — gap B12. The backend records jobs but keeps no audit trail of
  // who changed what, so this stays fixtures with no live path to try.
  return projectId ? ACTIVITY.filter((e) => e.project_id === projectId) : ACTIVITY;
}

/**
 * NEEDS-ENDPOINT: POST /api/v1/datasets/{id}/append?dry_run=true
 * Dry run only. Nothing is written until the user confirms.
 */
export async function getMergePreview(
  _datasetId: string,
  filename: string
): Promise<Sourced<MergePreview>> {
  await settle();
  // NOT BUILT — gap B13. There is no append endpoint, dry run or otherwise.
  return notBuilt(
    { ...MERGE_PREVIEW, incoming_filename: filename },
    "POST /api/v1/datasets/{id}/append?dry_run=true"
  );
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
): Promise<Sourced<ForecastSeries | null>> {
  await settle();
  // PARTIAL, and deliberately fixture-first — gap B1.
  //
  // `GET /api/v1/forecasts/{id}/{series}` is live and returns real future
  // points, but no endpoint returns the history they are drawn against. A chart
  // of 30 forecast points with no actuals behind them is not the chart this
  // screen is, so the fixture stays until B1 lands. `toForecastSeries` in
  // adapters.ts is ready for the live half the moment it does.
  const detail = SERIES_DETAIL[seriesId];
  if (!detail) return notBuilt(null, "history in GET /api/v1/forecasts/{id}/{series}");
  const cutoff = detail.points.findIndex((p, i) => p.actual !== null && detail.points[i + 1]?.actual == null);
  return notBuilt({
    label: `${detail.item_name} · ${detail.location}`,
    cutoff_index: cutoff,
    points: detail.points,
    historical_range: { from: detail.points[0].t, to: detail.points[cutoff].t },
    forecast_range: {
      from: detail.points[cutoff + 1].t,
      to: detail.points[detail.points.length - 1].t,
    },
    unit: "units",
  }, "history in GET /api/v1/forecasts/{id}/{series}");
}

/** NEEDS-ENDPOINT: GET /api/v1/datasets/{id}/parameters */
export async function getPlanningParameters(
  _datasetId: string
): Promise<Sourced<PlanningParameters>> {
  await settle();
  // NOT BUILT — gap B14. Lead times and service levels are engine constants in
  // `backend/app/decision/reorder.py`, not stored per category or editable.
  return notBuilt(PLANNING_PARAMETERS, "GET/PUT /api/v1/datasets/{id}/parameters");
}

/** LIVE — GET /api/v1/value/{dataset_id}. 404s until a forecast has run. */
export async function getValueSimulation(
  datasetId: string
): Promise<Sourced<ValueSimulation>> {
  await settle();
  return fromBackend(
    async () => toValueSimulation(await backend.getValue(datasetId), datasetId),
    () => VALUE_SIMULATION
  );
}

export { DEFAULT_PROJECT_ID };
export type { Sourced };
export * from "./types";
