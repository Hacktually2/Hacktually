import type { SupplyChainResponse } from "./types";
import { INVENTORY_ROWS, RISK_SUMMARY } from "./inventory.ts";

/** GET /api/v1/recommendations/{dataset_id} */
export const SUPPLY_CHAIN: SupplyChainResponse = {
  dataset_id: "ds_8f21c4",
  generated_at: "2026-09-17T13:42:00+07:00",
  mode: "ritel",
  rows: INVENTORY_ROWS,
  summary: [...RISK_SUMMARY],
  filters: {
    locations: [
      { value: "all", label: "All locations" },
      { value: "JKT-01", label: "Jakarta Pusat" },
      { value: "JKT-02", label: "Jakarta Timur" },
      { value: "SBY-02", label: "Surabaya" },
      { value: "MDN-01", label: "Medan" },
      { value: "BDG-01", label: "Bandung" },
      { value: "SMG-01", label: "Semarang" },
    ],
    categories: [
      { value: "all", label: "All categories" },
      { value: "Beverage", label: "Beverage" },
      { value: "Snack", label: "Snack" },
      { value: "Staple", label: "Staple" },
      { value: "Home Care", label: "Home Care" },
      { value: "Personal Care", label: "Personal Care" },
      { value: "Instant Food", label: "Instant Food" },
      { value: "Dairy", label: "Dairy" },
      { value: "Canned", label: "Canned" },
      { value: "Condiment", label: "Condiment" },
      { value: "Bakery", label: "Bakery" },
    ],
    risks: [
      { value: "all", label: "All statuses" },
      { value: "attention", label: "Needs attention", sublabel: "At risk and stockout risk" },
      { value: "critical", label: "Stockout risk" },
      { value: "at_risk", label: "At risk" },
      { value: "watch", label: "Watch" },
      { value: "healthy", label: "Healthy" },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Filtering — done here because it is the backend's job. Risk classification   */
/* is never recomputed; rows are only selected by the status already assigned.  */
/* -------------------------------------------------------------------------- */

export interface SupplyChainFilters {
  risk?: string;
  location?: string;
  category?: string;
}

export function buildSupplyChainResponse(
  filters: SupplyChainFilters = {}
): SupplyChainResponse {
  const { risk = "all", location = "all", category = "all" } = filters;

  const rows = SUPPLY_CHAIN.rows.filter((row) => {
    if (location !== "all" && row.location_id !== location) return false;
    if (category !== "all" && row.category !== category) return false;
    if (risk === "all") return true;
    // "attention" is the drill-down target from the Overview stockout KPI.
    if (risk === "attention") return row.risk === "critical" || row.risk === "at_risk";
    return row.risk === risk;
  });

  return { ...SUPPLY_CHAIN, rows };
}
