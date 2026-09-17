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
 *
 * As of the 2026-09-18 backend almost everything is LIVE, and nothing is
 * reshaped on the way through: those endpoints return the types below exactly.
 * The remaining NOT BUILT entries are numbered gaps in migration-report.md.
 */
import { backend } from "@/lib/backend/client";
import { toJobState, toPlanningParameters } from "@/lib/backend/adapters";
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
 * LIVE — GET /api/v1/projects
 *
 * A real project read model now, not a dataset list dressed up as one: name,
 * organisation, series count, status and a sparkline all come from the service.
 *
 * `demoFixtures` appends the three fixture dashboards. Off by default: a
 * workspace created five minutes ago has no business showing PT ABC's branches,
 * and callers pass `ownsDemoNetwork(user.id)` so the demo profile keeps them.
 */
export async function getProjects(
  options: { demoFixtures?: boolean } = {}
): Promise<Sourced<Project[]>> {
  await settle();
  const sourced = await fromBackend(
    () => backend.listProjects(),
    () => []
  );
  if (!options.demoFixtures) return sourced;
  return { ...sourced, data: [...sourced.data, ...PROJECTS] };
}

/**
 * One project, by either id it can be reached under.
 *
 * The service mints its own project id (`prj-ds_abc123`) distinct from the
 * dataset id (`ds_abc123`), and both appear in links: the project chooser uses
 * the project id, while a branch in the auth layer records the dataset id it
 * was split from. Rather than rewrite every stored id, this resolves both — ask
 * the service directly, then fall back to matching on `dataset_id`.
 *
 * It also keeps the distinction between "no such thing" and "could not ask".
 * If the service answered and does not have it, the page 404s. If the service
 * could not be reached, 404 would be a lie — the dataset was there a minute
 * ago — so the screens render in fallback mode against a placeholder and their
 * badges explain why the numbers are demo data. Without this, one blip turns
 * every live dashboard into "page not found".
 */
export async function getProject(projectId: string): Promise<Project | undefined> {
  const fixture = PROJECTS.find((p) => p.project_id === projectId);
  if (fixture) return fixture;

  const direct = await fromBackend(
    () => backend.getProject(projectId),
    () => null,
  );
  if (direct.data) return direct.data;

  const { data, live } = await getProjects();
  const found = data.find(
    (p) => p.project_id === projectId || p.dataset_id === projectId,
  );
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

/** LIVE — GET /api/v1/datasets/{id}/mapping. Sample values and unmapped columns included. */
export async function getMapping(datasetId: string): Promise<Sourced<MappingResponse>> {
  await settle();
  return fromBackend(() => backend.getMapping(datasetId), () => MAPPING);
}

/** LIVE — GET /api/v1/datasets/{id}/health. */
export async function getHealth(datasetId: string): Promise<Sourced<HealthReport>> {
  await settle();
  return fromBackend(() => backend.getHealth(datasetId), () => HEALTH);
}

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

/**
 * LIVE — GET /api/v1/overview/{dataset_id}
 *
 * `location` scopes the entire response server-side, so a branch manager's
 * KPIs, chart and ranked actions are built from their branch alone. The caller
 * decides who may ask for which branch — see `branchScope` in auth/session.ts.
 */
export async function getOverview(
  datasetId: string,
  location?: string | null
): Promise<Sourced<OverviewResponse>> {
  await settle();
  return fromBackend(
    () => backend.getOverview(datasetId, location ?? undefined),
    () => OVERVIEW
  );
}

/**
 * GET /api/v1/demand/{dataset_id}?date_range=&product=&location=&compare=
 *
 * Filtering is the backend's job, so it is applied here rather than in a
 * component. The real endpoint does the same work against SQLite.
 */
export async function getDemand(
  datasetId: string,
  filters: Partial<DemandResponse["active_filters"]> = {},
  /** Locations the viewer may see, or null for unrestricted. */
  allowed: string[] | null = null
): Promise<Sourced<DemandResponse>> {
  await settle();
  // LIVE. Filtering is the backend's job and it does it — the query goes
  // straight through, and the response says which filters it applied.
  return fromBackend(
    async () => {
      const response = await backend.getDemand(
        datasetId,
        filters as Record<string, string | undefined>
      );
      if (allowed === null) return response;
      const permitted = new Set(allowed);

      // `forecast_rows` and the chart honour `location`. Two other parts of the
      // same response do not:
      //
      //   filters.locations   every branch's NAME  — cosmetic (gap B11b)
      //   sales_by_location   every branch's SALES — a real leak (gap B11c)
      //
      // The second one matters: it is a bar per branch with figures attached,
      // served to someone scoped to one branch. Narrowed to what they hold, so
      // it stays off the screen — but the values are still in the payload, so
      // this is mitigation. Only the service can fix it.
      return {
        ...response,
        sales_by_location: response.sales_by_location.filter((bar) =>
          permitted.has(bar.key) || permitted.has(bar.label)
        ),
        filters: {
          ...response.filters,
          locations: response.filters.locations.filter(
            (option) => option.value === "all" || permitted.has(option.value)
          ),
        },
      };
    },
    () => buildDemandResponse(filters)
  );
}

/**
 * LIVE — GET /api/v1/recommendations/{dataset_id}
 *
 * Every filter is applied by the service, including `location`. Nothing is
 * narrowed after it arrives, which is the difference between a boundary and a
 * display filter: rows for other branches are never in the payload.
 *
 * An unknown or unauthorised branch code returns no rows rather than the whole
 * network, so a mistyped scope fails closed.
 */
export async function getSupplyChain(
  datasetId: string,
  filters: SupplyChainFilters = {},
  scopedLocation?: string | null
): Promise<Sourced<SupplyChainResponse>> {
  await settle();
  return fromBackend(
    async () => {
      const response = await backend.getRecommendations(datasetId, {
        risk: filters.risk,
        // The access scope wins over whatever the filter bar asked for: a
        // manager cannot widen their own view by editing the query string.
        location: scopedLocation ?? filters.location,
        category: filters.category,
      });

      if (!scopedLocation) return response;

      // The rows come back scoped, but `filters.locations` still enumerates
      // every branch in the dataset, which would put the names of branches this
      // person cannot open into their filter dropdown.
      //
      // Narrowing it here keeps them off the screen. It is NOT a fix: the names
      // were already in the response, so this is a display filter. The real fix
      // is for the service to scope its filter options the way it scopes its
      // rows — see gap B11b in migration-report.md.
      return {
        ...response,
        filters: {
          ...response.filters,
          locations: response.filters.locations.filter(
            (option) => option.value === scopedLocation || option.value === "all"
          ),
        },
      };
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
  datasetId: string,
  horizonDays = 30
): Promise<Sourced<PlanningParameters>> {
  await settle();
  // LIVE — GET /api/v1/datasets/{id}/params. The one read model still in its
  // own shape, so `toPlanningParameters` merges what is set with what the
  // dataset suggests and records which is which.
  return fromBackend(
    async () =>
      toPlanningParameters(await backend.getParams(datasetId), datasetId, horizonDays),
    () => PLANNING_PARAMETERS
  );
}

/** LIVE — GET /api/v1/value/{dataset_id}. 404s until a forecast has run. */
export async function getValueSimulation(
  datasetId: string
): Promise<Sourced<ValueSimulation>> {
  await settle();
  return fromBackend(() => backend.getValue(datasetId), () => VALUE_SIMULATION);
}

export { DEFAULT_PROJECT_ID };
export type { Sourced };
export * from "./types";
