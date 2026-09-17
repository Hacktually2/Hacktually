/**
 * Fixture consistency check.
 *
 * The dummy data stands in for the backend, so a demo is only as credible as
 * its internal arithmetic. Every assertion here is something a judge or a
 * planner could catch by reading two numbers off the screen.
 *
 * Run: npm run check:fixtures
 */
import assert from "node:assert/strict";
import { DEMAND } from "./demand.ts";
import { INVENTORY_ROWS, RISK_SUMMARY } from "./inventory.ts";
import { HEALTH } from "./onboarding.ts";
import { OVERVIEW } from "./overview.ts";
import { SUPPLY_CHAIN } from "./supply-chain.ts";

let checks = 0;
const check = (label: string, fn: () => void) => {
  fn();
  checks++;
  console.log(`  ok  ${label}`);
};

console.log("fixture consistency");

check("every recommendation equals the sum of its explanation lines", () => {
  for (const row of INVENTORY_ROWS) {
    if (row.recommended_qty === 0) continue;
    const sum = row.explanation.lines.reduce((s, l) => s + l.value, 0);
    assert.equal(sum, row.recommended_qty, `${row.item_id}: ${sum} !== ${row.recommended_qty}`);
    assert.equal(row.explanation.total_value, row.recommended_qty, `${row.item_id} total`);
  }
});

check("recommended quantities respect the minimum order quantity", () => {
  for (const row of INVENTORY_ROWS) {
    if (row.recommended_qty === 0) continue;
    assert.equal(row.recommended_qty % row.moq, 0, `${row.item_id} is not a multiple of its MOQ`);
  }
});

check("risk summary counts match the rows", () => {
  for (const band of RISK_SUMMARY) {
    const rows = INVENTORY_ROWS.filter((r) => r.risk === band.risk);
    assert.equal(band.series_count, rows.length, `${band.risk} count`);
    assert.equal(
      band.recommended_units,
      rows.reduce((s, r) => s + r.recommended_qty, 0),
      `${band.risk} units`
    );
  }
});

check("overview inventory bands agree with the supply chain rows", () => {
  for (const band of OVERVIEW.inventory.bands) {
    const count = SUPPLY_CHAIN.rows.filter((r) => r.risk === band.risk).length;
    assert.equal(band.series_count, count, `${band.risk} differs between Overview and Supply Chain`);
  }
  const total = OVERVIEW.inventory.bands.reduce((s, b) => s + b.series_count, 0);
  assert.equal(total, OVERVIEW.inventory.total_series);
});

check("the stockout KPI equals the rows needing attention", () => {
  const kpi = OVERVIEW.kpis.find((k) => k.key === "stockout_risk");
  const attention = SUPPLY_CHAIN.rows.filter(
    (r) => r.risk === "critical" || r.risk === "at_risk"
  ).length;
  assert.equal(kpi?.value, attention, "Overview stockout KPI disagrees with Supply Chain");
});

check("every priority action points at a real series", () => {
  for (const action of OVERVIEW.priority_actions) {
    const row = SUPPLY_CHAIN.rows.find((r) => r.series_id === action.series_id);
    assert.ok(row, `${action.series_id} has no matching inventory row`);
    assert.equal(action.risk, row.risk, `${action.series_id} risk differs from the table`);
    assert.equal(
      action.metric_value,
      row.days_until_stockout,
      `${action.series_id} days-until-stockout differs from the table`
    );
  }
});

check("unavailable metrics carry a reason and no value", () => {
  for (const kpi of OVERVIEW.kpis) {
    if (kpi.value === null) assert.ok(kpi.unavailable_reason, `${kpi.key} has no reason`);
    else assert.equal(kpi.unavailable_reason, null, `${kpi.key} has both a value and a reason`);
  }
});

check("the excluded list matches the forecastable count", () => {
  assert.equal(
    HEALTH.series_excluded.length,
    HEALTH.series_total - HEALTH.series_forecastable,
    "excluded series listed does not match series_total − series_forecastable"
  );
});

check("demand classes account for every series", () => {
  const { classes, total_series } = DEMAND.pattern;
  assert.equal(
    classes.reduce((s, c) => s + c.series_count, 0),
    total_series,
    "class counts do not sum to the total"
  );
  const share = classes.reduce((s, c) => s + c.share_percent, 0);
  assert.ok(Math.abs(share - 100) < 0.5, `shares sum to ${share}, not 100`);
});

check("chart cutoffs sit on the last observed point", () => {
  for (const [label, chart] of [
    ["overview", OVERVIEW.demand_chart],
    ["demand", DEMAND.chart],
  ] as const) {
    const cut = chart.points[chart.cutoff_index];
    assert.ok(cut.actual !== null, `${label}: cutoff point has no actual value`);
    const next = chart.points[chart.cutoff_index + 1];
    assert.ok(next && next.actual === null, `${label}: point after cutoff should be forecast only`);
  }
});

check("forecast intervals bracket the forecast", () => {
  for (const [label, chart] of [
    ["overview", OVERVIEW.demand_chart],
    ["demand", DEMAND.chart],
  ] as const) {
    for (const p of chart.points) {
      if (p.forecast === null) continue;
      assert.ok(p.lower !== null && p.upper !== null, `${label} ${p.t}: missing interval`);
      assert.ok(p.lower <= p.forecast, `${label} ${p.t}: lower above forecast`);
      assert.ok(p.upper >= p.forecast, `${label} ${p.t}: upper below forecast`);
    }
  }
});

console.log(`\n${checks} checks passed`);
