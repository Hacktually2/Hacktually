import { INVENTORY_ROWS } from "./inventory.ts";
import type {
  RiskLevel,
  ScenarioInput,
  ScenarioOutcome,
  ScenarioRow,
  ScenarioTotals,
} from "./types";

/**
 * NEEDS-ENDPOINT: POST /api/v1/simulate/{dataset_id}
 *
 * The what-if engine. This is backend work living in the fixture layer, exactly
 * like the filtering in demand.ts: it applies the reorder formulas from
 * architecture.md with substituted inputs. The frontend calls it through a
 * server action and renders whatever comes back.
 *
 * Running the same formulas as the live engine is the point. A separate
 * approximation written in the UI could quietly disagree with the real
 * recommendation, which is the failure this whole codebase is arranged to
 * avoid.
 */

/** Safety factor per service level. */
const Z: Record<number, number> = {
  90: 1.2816,
  95: 1.6449,
  98: 2.0537,
  99: 2.3263,
};

export const DEFAULT_SCENARIO: ScenarioInput = {
  lead_time_multiplier: 1,
  demand_multiplier: 1,
  service_level: 95,
  moq_multiplier: 1,
  capacity_units: null,
};

/** The same thresholds the decision engine classifies with. */
function classify(coverDays: number, leadTimeDays: number): RiskLevel {
  const cover = coverDays / leadTimeDays;
  if (cover < 0.6) return "critical";
  if (cover < 1.0) return "at_risk";
  if (cover < 1.5) return "watch";
  return "healthy";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function runSimulation(
  _datasetId: string,
  scenario: ScenarioInput
): ScenarioOutcome {
  const z = Z[scenario.service_level] ?? Z[95];
  const zBase = Z[95];

  const rows: ScenarioRow[] = INVENTORY_ROWS.map((row) => {
    const dailyBase = row.forecast_demand / 30;
    const daily = dailyBase * scenario.demand_multiplier;
    const leadTime = Math.max(1, Math.round(row.lead_time_days * scenario.lead_time_multiplier));

    // The published safety stock implies a variability factor for this series.
    // Recovering it keeps each item's own volatility in the simulated figure
    // instead of flattening every SKU onto one assumption.
    const impliedK =
      row.safety_stock / (dailyBase * Math.sqrt(row.lead_time_days) * zBase) || 0;

    const leadTimeDemand = daily * leadTime;
    const safetyStock = impliedK * z * daily * Math.sqrt(leadTime);
    const required = leadTimeDemand + safetyStock;
    const raw = Math.max(0, required - row.current_stock);

    const moq = Math.max(1, Math.round(row.moq * scenario.moq_multiplier));
    const qtyAfter = raw === 0 ? 0 : Math.ceil(raw / moq) * moq;
    const coverAfter = daily > 0 ? Math.round(row.current_stock / daily) : 0;

    return {
      series_id: row.series_id,
      item_name: row.item_name,
      location: row.location,
      risk_before: row.risk,
      risk_after: classify(coverAfter, leadTime),
      qty_before: row.recommended_qty,
      qty_after: qtyAfter,
      cover_before: row.coverage_days,
      cover_after: coverAfter,
      lead_time_after: leadTime,
      deferred: false,
    };
  });

  // Capacity is spent on the most urgent items first, measured by how little
  // cover they have relative to the lead time they are waiting out.
  let unmetUnits = 0;
  let deferredItems = 0;
  if (scenario.capacity_units !== null) {
    const byUrgency = [...rows]
      .filter((r) => r.qty_after > 0)
      .sort((a, b) => a.cover_after / a.lead_time_after - b.cover_after / b.lead_time_after);

    let remaining = scenario.capacity_units;
    for (const row of byUrgency) {
      if (row.qty_after <= remaining) {
        remaining -= row.qty_after;
      } else {
        unmetUnits += row.qty_after;
        deferredItems++;
        row.deferred = true;
        row.qty_after = 0;
      }
    }
  }

  const totals = (
    pick: (r: ScenarioRow) => { qty: number; risk: RiskLevel; cover: number }
  ): ScenarioTotals => {
    const picked = rows.map(pick);
    return {
      units_to_order: picked.reduce((sum, p) => sum + p.qty, 0),
      items_needing_order: picked.filter((p) => p.qty > 0).length,
      items_at_risk: picked.filter((p) => p.risk === "critical" || p.risk === "at_risk").length,
      median_cover_days: median(picked.map((p) => p.cover)),
    };
  };

  const baseline = totals((r) => ({
    qty: r.qty_before,
    risk: r.risk_before,
    cover: r.cover_before,
  }));
  const simulated = totals((r) => ({
    qty: r.qty_after,
    risk: r.risk_after,
    cover: r.cover_after,
  }));

  // Ordered by how much the scenario moved each item, so the table opens on
  // what changed rather than on alphabetical noise.
  rows.sort(
    (a, b) =>
      Math.abs(b.qty_after - b.qty_before) - Math.abs(a.qty_after - a.qty_before)
  );

  return {
    scenario,
    baseline,
    simulated,
    rows,
    notes: buildNotes(scenario, baseline, simulated, deferredItems, unmetUnits),
    capacity:
      scenario.capacity_units === null
        ? null
        : { capped: deferredItems > 0, deferred_items: deferredItems, unmet_units: unmetUnits },
  };
}

/** Plain observations about the run. Rendered verbatim by the UI. */
function buildNotes(
  scenario: ScenarioInput,
  baseline: ScenarioTotals,
  simulated: ScenarioTotals,
  deferredItems: number,
  unmetUnits: number
): string[] {
  const notes: string[] = [];
  const unitDelta = simulated.units_to_order - baseline.units_to_order;
  const riskDelta = simulated.items_at_risk - baseline.items_at_risk;

  if (scenario.lead_time_multiplier !== 1) {
    notes.push(
      `Lead times at ${scenario.lead_time_multiplier}× widen the window each item has to cover, which moves both the safety buffer and the quantity due now.`
    );
  }
  if (scenario.demand_multiplier !== 1) {
    notes.push(
      `Demand at ${scenario.demand_multiplier}× is applied evenly across the horizon. A real Lebaran peak concentrates in the three weeks before the holiday, so treat this as the flat-rate case.`
    );
  }
  if (scenario.service_level !== 95) {
    notes.push(
      `A ${scenario.service_level}% service level changes only the safety buffer, not expected demand. Most of the extra stock sits against variability that may never arrive.`
    );
  }
  if (scenario.moq_multiplier !== 1) {
    notes.push(
      `Larger minimums round every order up, so low-volume items carry the cost even when they needed very little.`
    );
  }
  if (deferredItems > 0) {
    notes.push(
      `Capacity ran out before ${deferredItems} ${deferredItems === 1 ? "item" : "items"} were covered, leaving ${unmetUnits.toLocaleString("en-GB")} units unordered. They are the least urgent by cover against lead time, not the smallest.`
    );
  }
  if (unitDelta === 0 && riskDelta === 0 && notes.length === 0) {
    notes.push("This is the current plan. Move a lever to compare against it.");
  }
  return notes;
}
