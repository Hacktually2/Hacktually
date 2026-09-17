import type { Project } from "./types";
import { PROJECT_SPARKLINES } from "./series.ts";

/**
 * NEEDS-ENDPOINT: GET /api/v1/projects
 *
 * All three are branches of one company, not three separate customers. That is
 * the shape the product is actually sold into: a distributor with a network of
 * branches, where a planner at head office sees every branch and a branch
 * manager sees one. The auth layer claims each of these by `project_id` and
 * decides who may open it (`auth/db.ts`, DEMO_PROJECT).
 *
 * Statuses stay deliberately different — ready, needs review, processing — so
 * every state of the onboarding flow is reachable from the branch list.
 */
export const PROJECTS: Project[] = [
  {
    project_id: "prj-abc",
    name: "Cabang Jakarta Pusat",
    organisation: "PT ABC Distribution",
    industry_mode: "ritel",
    dataset_id: "ds_8f21c4",
    dataset_filename: "sales_2026.csv",
    uploaded_at: "2026-09-17T06:12:00+07:00",
    forecast_generated_at: "2026-09-17T13:42:00+07:00",
    last_opened_at: "2026-09-17T14:08:00+07:00",
    status: "ready",
    horizon_days: 30,
    series_total: 428,
    health_score: 82,
    demand_sparkline: PROJECT_SPARKLINES["prj-abc"],
  },
  {
    project_id: "prj-nus",
    name: "Pabrik Bandung",
    organisation: "PT ABC Distribution",
    industry_mode: "manufaktur",
    dataset_id: "ds_3b90ae",
    dataset_filename: "pos_export_agustus.csv",
    uploaded_at: "2026-09-16T09:30:00+07:00",
    forecast_generated_at: null,
    last_opened_at: "2026-09-16T10:02:00+07:00",
    status: "needs_review",
    horizon_days: 30,
    series_total: 192,
    health_score: 61,
    demand_sparkline: PROJECT_SPARKLINES["prj-nus"],
  },
  {
    project_id: "prj-sgr",
    name: "Cabang Surabaya",
    organisation: "PT ABC Distribution",
    industry_mode: "ritel",
    dataset_id: "ds_c70d15",
    dataset_filename: "wms_stock_2026.csv",
    uploaded_at: "2026-09-17T14:55:00+07:00",
    forecast_generated_at: null,
    last_opened_at: "2026-09-17T14:55:00+07:00",
    status: "processing",
    horizon_days: 30,
    series_total: 1204,
    health_score: 0,
    demand_sparkline: PROJECT_SPARKLINES["prj-sgr"],
  },
];

export const DEFAULT_PROJECT_ID = "prj-abc";
