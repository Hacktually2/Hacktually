import type { MergePreview } from "./types";

/**
 * NEEDS-ENDPOINT: POST /api/v1/datasets/{id}/append?dry_run=true
 *
 * The dry run the update screen shows before anything is written. The merge key
 * is the canonical (timestamp, series_id) pair from architecture.md: overlapping
 * rows are replaced by the incoming values, everything else is kept, and nothing
 * is ever deleted.
 */
export const MERGE_PREVIEW: MergePreview = {
  dataset_id: "ds_8f21c4",
  incoming_filename: "sales_2026_w38.csv",
  incoming_rows: 1600,
  rows_added: 1284,
  rows_updated: 316,
  rows_unchanged: 0,
  rows_retained: 152639,
  series_new: ["KRP-330__JKT-02", "MLO-120__BDG-01"],
  series_total_before: 428,
  series_total_after: 430,
  coverage_before: { from: "2025-01-02", to: "2026-09-09" },
  coverage_after: { from: "2025-01-02", to: "2026-09-16" },
  conflicts: [
    {
      series_id: "MSD-70__JKT-01",
      item_name: "Mie Sedaap Goreng 70g",
      timestamp: "2026-09-08",
      existing_value: 512,
      incoming_value: 548,
    },
    {
      series_id: "AIR-600__JKT-02",
      item_name: "Air Aqua 600ml x24",
      timestamp: "2026-09-08",
      existing_value: 388,
      incoming_value: 402,
    },
    {
      series_id: "KCG-200__SBY-02",
      item_name: "Kacang Garuda 200g",
      timestamp: "2026-09-09",
      existing_value: 96,
      incoming_value: 143,
    },
    {
      series_id: "TPG-24__JKT-02",
      item_name: "Teh Pucuk 350ml x24",
      timestamp: "2026-09-09",
      existing_value: 271,
      incoming_value: 264,
    },
    {
      series_id: "MNK-2L__MDN-01",
      item_name: "Minyak Sania 2L",
      timestamp: "2026-09-09",
      existing_value: 430,
      incoming_value: 455,
    },
  ],
  warnings: [
    {
      id: "restatement",
      severity: "warning",
      title: "316 rows restate periods you already had",
      detail:
        "The incoming file reports different quantities for dates already in the dataset, usually because late invoices were posted after the last export. The newer values win.",
    },
    {
      id: "new-series",
      severity: "info",
      title: "2 products appear for the first time",
      detail:
        "They will be forecast once they have enough history. Until then they are listed but carry no forecast.",
    },
    {
      id: "refit",
      severity: "info",
      title: "Forecasts will be regenerated",
      detail:
        "Merging changes the history the models were fitted on, so the forecast and every recommendation derived from it are recalculated.",
    },
  ],
  mergeable: true,
};
