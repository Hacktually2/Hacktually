import { INVENTORY_ROWS } from "./inventory.ts";
import type { CategoryParameters, PlanningParameters } from "./types";

/**
 * NEEDS-ENDPOINT: GET/PUT /api/v1/datasets/{id}/parameters
 *
 * Derived from the rows so the parameters screen and the recommendations can
 * never show different lead times for the same category.
 */
function byCategory(): CategoryParameters[] {
  const groups = new Map<string, typeof INVENTORY_ROWS>();
  for (const row of INVENTORY_ROWS) {
    const bucket = groups.get(row.category);
    if (bucket) bucket.push(row);
    else groups.set(row.category, [row]);
  }

  return [...groups.entries()]
    .map(([category, rows]) => {
      // The modal value, so the category figure matches what most of its SKUs
      // actually carry rather than an average nothing in it uses.
      const mode = <T extends string | number>(values: T[]): T => {
        const counts = new Map<T, number>();
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };
      const leadTime = mode(rows.map((r) => r.lead_time_days));
      const moq = mode(rows.map((r) => r.moq));
      return {
        category,
        series_count: rows.length,
        lead_time_days: leadTime,
        service_level: 95,
        moq,
        // lead_time and moq are optional canonical columns and this dataset
        // carries them; service level never comes from a file.
        source: "dataset" as const,
        overrides: rows.filter(
          (r) => r.lead_time_days !== leadTime || r.moq !== moq
        ).length,
      };
    })
    .sort((a, b) => b.series_count - a.series_count || a.category.localeCompare(b.category));
}

export const PLANNING_PARAMETERS: PlanningParameters = {
  dataset_id: "ds_8f21c4",
  horizon_days: 30,
  margin_percent: 18,
  holding_cost_percent: 24,
  categories: byCategory(),
};
