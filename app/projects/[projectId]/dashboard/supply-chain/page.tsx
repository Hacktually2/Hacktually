import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPlanningParameters,
  getProject,
  getSupplyChain,
  getValueSimulation,
} from "@/app/dummy-data";
import type { PlanningParameters, ValueSimulation } from "@/app/dummy-data/types";
import { FilterBar, type FilterSpec } from "@/components/dashboard/filter-bar";
import { InventoryWorkspace } from "@/components/dashboard/inventory-workspace";
import { PlanningParametersButton } from "@/components/dashboard/planning-parameters";
import { PostureStrip } from "@/components/dashboard/posture-strip";
import { ProcurementAlert } from "@/components/dashboard/procurement-alert";
import { ScenarioSimulator } from "@/components/dashboard/scenario-simulator";
import { DataSource } from "@/components/ui/data-source";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { runSimulation, DEFAULT_SCENARIO } from "@/app/dummy-data/simulation";
import { savePlanningParameters, simulate } from "./actions";

export const metadata: Metadata = { title: "Supply Chain" };

export default async function SupplyChainPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/dashboard/supply-chain">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(projectId);
  if (!project) notFound();

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const [
    { data: supply, note: supplyNote },
    { data: value, note: valueNote },
    { data: parameters, note: parametersNote },
  ] = await Promise.all([
    getSupplyChain(
      project.dataset_id,
      {
        risk: one(query.risk),
        location: one(query.location),
        category: one(query.category),
      },
      project.industry_mode
    ),
    getValueSimulation(project.dataset_id),
    getPlanningParameters(project.dataset_id),
  ]);

  // The neutral run is computed here, so the simulator opens showing the real
  // current plan rather than an empty state waiting on a round trip.
  const neutralScenario = runSimulation(project.dataset_id, DEFAULT_SCENARIO);

  const filterSpecs: FilterSpec[] = [
    {
      key: "risk",
      label: "Status",
      options: supply.filters.risks,
      value: one(query.risk) ?? "all",
      neutral: "all",
    },
    {
      key: "location",
      label: "Location",
      options: supply.filters.locations,
      value: one(query.location) ?? "all",
      neutral: "all",
    },
    {
      key: "category",
      label: "Category",
      options: supply.filters.categories,
      value: one(query.category) ?? "all",
      neutral: "all",
    },
  ];

  return (
    <main className="layout-shell flex-1 py-8">
      <div className="animate-enter">
        <PageHeader
          title="Supply Chain"
          description="Inventory against expected demand, with the reasoning behind every recommended order."
          context={
            <>
              {project.organisation} · {project.name} · {supply.mode} mode
            </>
          }
          action={
            <PlanningParametersButton
              parameters={parameters}
              onSave={async (next) => {
                "use server";
                await savePlanningParameters(project.dataset_id, next);
              }}
            />
          }
        />
        <div className="mt-4 max-w-2xl space-y-2">
          <DataSource note={supplyNote} />
          <DataSource note={parametersNote} />
        </div>
      </div>

      <div className="mt-7 animate-enter [--enter-delay:60ms]">
        <PostureStrip
          summary={supply.summary}
          headline={supply.headline}
          activeRisk={one(query.risk) ?? "all"}
          hrefFor={(risk) => {
            // Keeps whatever else is filtered, and drops the parameter entirely
            // when it is back to the neutral value.
            const next = new URLSearchParams();
            const location = one(query.location);
            const category = one(query.category);
            if (risk !== "all") next.set("risk", risk);
            if (location) next.set("location", location);
            if (category) next.set("category", category);
            const qs = next.toString();
            return qs ? `?${qs}` : `/projects/${projectId}/dashboard/supply-chain`;
          }}
        />
      </div>

      <div className="mt-5 animate-enter [--enter-delay:260ms]">
        <FilterBar filters={filterSpecs} />
      </div>

      <div className="mt-5 animate-enter-fade [--enter-delay:300ms]">
        <Panel
          title="Inventory vs demand"
          description="Select a row to see why an item is flagged and how its order quantity was reached."
          padded={false}
          footer="Status and recommended quantities come from the decision engine. Sorting and search do not change them."
          action={
            <ProcurementAlert
              projectId={projectId}
              datasetId={project.dataset_id}
              // Only what the engine flagged, and only where it wants an order.
              // Alerting on a healthy item trains people to ignore the channel.
              rows={supply.rows.filter(
                (row) =>
                  (row.risk === "at_risk" || row.risk === "critical") &&
                  row.recommended_qty > 0
              )}
            />
          }
        >
          <InventoryWorkspace rows={supply.rows} />
        </Panel>
      </div>

      <div className="mt-5 animate-enter space-y-3 [--enter-delay:360ms]">
        <DataSource note={valueNote} />
        <ValuePanel value={value} parameters={parameters} />
      </div>

      <section className="mt-10 scroll-mt-28" id="scenario" aria-label="Scenario simulation">
        <PageHeader
          title="What if?"
          description="Run the same decision engine against different assumptions, and see which items change before you commit to anything."
        />
        <div className="mt-5">
          <ScenarioSimulator
            datasetId={project.dataset_id}
            initial={neutralScenario}
            run={simulate}
          />
        </div>
      </section>
    </main>
  );
}

/**
 * Value simulation — the same replenishment policy run under both forecasts
 * across the backtest windows, compared on outcomes rather than error metrics.
 */
function ValuePanel({
  value,
  parameters,
}: {
  value: ValueSimulation;
  parameters: PlanningParameters;
}) {
  // Rupiah here is derived from margin and holding cost, which only a user can
  // supply. Unset means withheld, not estimated (architecture.md: never invent
  // a missing parameter).
  const hasValueInputs =
    parameters.margin_percent !== null && parameters.holding_cost_percent !== null;

  const rows = [
    {
      label: "Fill rate",
      baseline: formatPercent(value.fill_rate_baseline_percent),
      model: formatPercent(value.fill_rate_model_percent),
      better: "higher",
    },
    {
      label: "Stockout events",
      baseline: formatNumber(value.stockout_events_baseline),
      model: formatNumber(value.stockout_events_model),
      better: "lower",
    },
  ];

  if (hasValueInputs) {
    rows.push({
      label: "Average inventory held",
      baseline: formatCurrency(value.avg_inventory_value_baseline),
      model: formatCurrency(value.avg_inventory_value_model),
      better: "lower",
    });
  }

  return (
    <Panel
      title="Simulated policy outcome"
      description={`${value.window_label}, against a ${value.baseline_name.toLowerCase()} baseline.`}
    >
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-center">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-default">
                <th className="py-2 pr-3 text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
                  Outcome
                </th>
                <th className="px-3 py-2 text-right text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
                  {value.baseline_name}
                </th>
                <th className="px-3 py-2 text-right text-meta font-semibold tracking-wide text-brand-deep uppercase">
                  This forecast
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border-subtle">
                  <td className="py-2.5 pr-3 text-body-sm text-ink">
                    {row.label}
                    <span className="ml-1.5 text-meta text-ink-tertiary">
                      ({row.better} is better)
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-body-sm text-ink-secondary"
                    data-numeric
                  >
                    {row.baseline}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-body-sm font-semibold text-brand-deep"
                    data-numeric
                  >
                    {row.model}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="surface-tinted p-5">
          <p className="text-body-sm font-medium text-ink-secondary">
            Net benefit over the simulated period
          </p>
          {hasValueInputs ? (
            <>
              <p
                className="mt-1.5 text-metric-lg leading-none font-bold text-brand-deep"
                data-numeric
              >
                {formatCurrency(value.net_benefit_idr)}
              </p>
              <p className="mt-2.5 text-meta leading-relaxed text-ink-tertiary">
                Fewer stockouts and less stock held, at {parameters.margin_percent}% margin and{" "}
                {parameters.holding_cost_percent}% annual holding cost. Not a projection of
                future savings.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-metric leading-none font-semibold text-ink-disabled">
                Unavailable
              </p>
              <p className="mt-2.5 text-meta leading-relaxed text-ink-tertiary">
                A rupiah figure needs your gross margin and holding cost. Set them in planning
                parameters and this fills in. Fill rate and stockout counts do not depend on
                them.
              </p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
