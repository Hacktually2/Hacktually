import type { Project } from "./types";
import { PROJECT_SPARKLINES } from "./series.ts";

/** NEEDS-ENDPOINT: GET /api/v1/projects */
export const PROJECTS: Project[] = [
  {
    project_id: "prj-abc",
    name: "Sales 2026",
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
    name: "Produksi Q3",
    organisation: "PT Nusantara Boga",
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
    name: "Stock Nasional",
    organisation: "PT Sinar Gemilang Retail",
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
