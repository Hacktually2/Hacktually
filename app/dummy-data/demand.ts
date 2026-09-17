import type { DemandResponse } from "./types";
import { DEMAND_WEEKLY, FORECAST_ROWS } from "./series.ts";

/** NEEDS-ENDPOINT: GET /api/v1/demand/{dataset_id} */
export const DEMAND: DemandResponse = {
  dataset_id: "ds_8f21c4",
  horizon_label: "17 Sep 2026 – 16 Oct 2026",
  chart: {
    label: "Actual vs forecast demand",
    cutoff_index: 80,
    points: DEMAND_WEEKLY,
    historical_range: { from: "2025-02-27", to: "2026-09-10" },
    forecast_range: { from: "2026-09-17", to: "2026-10-15" },
    unit: "units",
  },
  accuracy: {
    model_name: "TimesFM",
    model_reason:
      "Selected per segment from 2 rolling validation windows. Smooth and erratic series had enough validation points to choose per series.",
    wape_percent: 11.4,
    bias_percent: 1.9,
    mase: 0.81,
    baseline_name: "4-week moving average",
    baseline_wape_percent: 19.7,
    validation_windows: 2,
  },
  pattern: {
    total_series: 428,
    classes: [
      {
        demand_class: "smooth",
        label: "Smooth",
        series_count: 206,
        share_percent: 48.1,
        description: "Regular intervals, stable volume. The easiest demand to plan against.",
        typical_model: "TimesFM",
      },
      {
        demand_class: "erratic",
        label: "Erratic",
        series_count: 115,
        share_percent: 26.9,
        description: "Ordered regularly, but quantities swing widely between orders.",
        typical_model: "TimesFM",
      },
      {
        demand_class: "intermittent",
        label: "Intermittent",
        series_count: 77,
        share_percent: 18.0,
        description: "Long gaps between orders, modest quantities when they arrive.",
        typical_model: "TSB",
      },
      {
        demand_class: "lumpy",
        label: "Lumpy",
        series_count: 30,
        share_percent: 7.0,
        description:
          "Long gaps and volatile quantities together. Hardest to forecast, widest intervals.",
        typical_model: "Croston",
      },
    ],
  },
  sales_by_product: [
    { key: "MSD-70", label: "Mie Sedaap Goreng 70g", sublabel: "Instant Food", value: 184920, share_percent: 18.1 },
    { key: "AIR-600", label: "Air Aqua 600ml x24", sublabel: "Beverage", value: 152340, share_percent: 14.9 },
    { key: "MNK-2L", label: "Minyak Sania 2L", sublabel: "Staple", value: 131680, share_percent: 12.9 },
    { key: "TPG-24", label: "Teh Pucuk 350ml x24", sublabel: "Beverage", value: 118450, share_percent: 11.6 },
    { key: "KPS-250", label: "Kopi Kapal Api 250g", sublabel: "Beverage", value: 96210, share_percent: 9.4 },
    { key: "TPU-100", label: "Tepung Segitiga 1kg", sublabel: "Staple", value: 84730, share_percent: 8.3 },
    { key: "PRM-150", label: "Permen Kopiko 150g", sublabel: "Snack", value: 71920, share_percent: 7.0 },
    { key: "KCG-200", label: "Kacang Garuda 200g", sublabel: "Snack", value: 63480, share_percent: 6.2 },
  ],
  sales_by_location: [
    { key: "JKT-01", label: "Jakarta Pusat", sublabel: "6 branches", value: 268400, share_percent: 26.3 },
    { key: "SBY-02", label: "Surabaya", sublabel: "4 branches", value: 214900, share_percent: 21.0 },
    { key: "JKT-02", label: "Jakarta Timur", sublabel: "3 branches", value: 176300, share_percent: 17.3 },
    { key: "MDN-01", label: "Medan", sublabel: "3 branches", value: 142700, share_percent: 14.0 },
    { key: "BDG-01", label: "Bandung", sublabel: "2 branches", value: 118600, share_percent: 11.6 },
    { key: "SMG-01", label: "Semarang", sublabel: "2 branches", value: 100342, share_percent: 9.8 },
  ],
  forecast_rows: FORECAST_ROWS,
  filters: {
    products: [
      { value: "all", label: "All products", sublabel: "428 series" },
      { value: "MSD-70", label: "Mie Sedaap Goreng 70g", sublabel: "Instant Food" },
      { value: "AIR-600", label: "Air Aqua 600ml x24", sublabel: "Beverage" },
      { value: "MNK-2L", label: "Minyak Sania 2L", sublabel: "Staple" },
      { value: "TPG-24", label: "Teh Pucuk 350ml x24", sublabel: "Beverage" },
      { value: "KCG-200", label: "Kacang Garuda 200g", sublabel: "Snack" },
      { value: "SRM-450", label: "Sirup Marjan 450ml", sublabel: "Beverage" },
    ],
    locations: [
      { value: "all", label: "All locations", sublabel: "6 locations" },
      { value: "JKT-01", label: "Jakarta Pusat" },
      { value: "JKT-02", label: "Jakarta Timur" },
      { value: "SBY-02", label: "Surabaya" },
      { value: "MDN-01", label: "Medan" },
      { value: "BDG-01", label: "Bandung" },
      { value: "SMG-01", label: "Semarang" },
    ],
    date_presets: [
      { value: "18m", label: "Last 18 months" },
      { value: "12m", label: "Last 12 months" },
      { value: "6m", label: "Last 6 months" },
      { value: "90d", label: "Last 90 days" },
    ],
  },
  active_filters: {
    date_range: "18m",
    product: "all",
    location: "all",
  },
};

/* -------------------------------------------------------------------------- */
/* Filtering — backend work, kept out of the components.                       */
/*                                                                            */
/* The real endpoint runs these selections in SQL. Simulating them here means  */
/* the UI never has to know whether a filter was applied server-side, and the  */
/* components stay pure renderers of whatever the response contains.           */
/* -------------------------------------------------------------------------- */

/** Historical weekly points retained per range. The 5 forecast points always stay. */
const HISTORY_WEEKS: Record<string, number> = {
  "18m": 81,
  "12m": 52,
  "6m": 26,
  "90d": 13,
};

export function buildDemandResponse(
  filters: Partial<DemandResponse["active_filters"]> = {}
): DemandResponse {
  // Spreading the incoming object directly would let an absent query parameter
  // (an explicit `undefined`) overwrite the default and make every filter look
  // active. Fall back per key instead.
  const active: DemandResponse["active_filters"] = {
    date_range: filters.date_range ?? DEMAND.active_filters.date_range,
    product: filters.product ?? DEMAND.active_filters.product,
    location: filters.location ?? DEMAND.active_filters.location,
  };

  // --- date range: slice the series the way a windowed query would ---------
  const keep = HISTORY_WEEKS[active.date_range] ?? HISTORY_WEEKS["18m"];
  const history = DEMAND_WEEKLY.slice(0, 81);
  const forecast = DEMAND_WEEKLY.slice(81);
  const slicedHistory = history.slice(Math.max(0, history.length - keep));
  const points = [...slicedHistory, ...forecast];

  // --- product / location: narrow the cross-sectional views ----------------
  const byProduct =
    active.product === "all"
      ? DEMAND.sales_by_product
      : DEMAND.sales_by_product.filter((b) => b.key === active.product);

  const byLocation =
    active.location === "all"
      ? DEMAND.sales_by_location
      : DEMAND.sales_by_location.filter((b) => b.key === active.location);

  const rows = DEMAND.forecast_rows.filter((r) => {
    const [itemId, locationId] = r.series_id.split("__");
    if (active.product !== "all" && itemId !== active.product) return false;
    if (active.location !== "all" && locationId !== active.location) return false;
    return true;
  });

  return {
    ...DEMAND,
    chart: {
      ...DEMAND.chart,
      points,
      cutoff_index: slicedHistory.length - 1,
      historical_range: {
        from: slicedHistory[0]?.t ?? DEMAND.chart.historical_range.from,
        to: DEMAND.chart.historical_range.to,
      },
    },
    sales_by_product: byProduct,
    sales_by_location: byLocation,
    forecast_rows: rows,
    active_filters: active,
  };
}
