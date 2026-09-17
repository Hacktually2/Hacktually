import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getProject, getSupplyChain, getValueSimulation } from "@/app/dummy-data";
import type { RiskLevel, ValueSimulation } from "@/app/dummy-data/types";
import { FilterBar, type FilterSpec } from "@/components/dashboard/filter-bar";
import { InventoryWorkspace } from "@/components/dashboard/inventory-workspace";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Supply Chain" };

const RISK_ACCENT = {
  critical: "border-l-status-critical",
  at_risk: "border-l-status-risk",
  watch: "border-l-status-watch",
  healthy: "border-l-status-healthy",
} as const satisfies Record<RiskLevel, string>;

export default async function SupplyChainPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/dashboard/supply-chain">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(projectId);
  if (!project) notFound();

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const [supply, value] = await Promise.all([
    getSupplyChain(project.dataset_id, {
      risk: one(query.risk),
      location: one(query.location),
      category: one(query.category),
    }),
    getValueSimulation(project.dataset_id),
  ]);

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
        />
      </div>

      {/* Status summary doubles as the filter affordance. */}
      <section
        className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Status summary"
      >
        {supply.summary.map((band, i) => (
          <div
            key={band.risk}
            className={`surface-card animate-enter border-l-4 p-4 ${RISK_ACCENT[band.risk]}`}
            style={{ "--enter-delay": `${60 + i * 45}ms` } as CSSProperties}
          >
            <p className="text-body-sm font-medium text-ink-secondary">{band.label}</p>
            <p className="mt-1 text-metric leading-none font-bold text-brand-deep" data-numeric>
              {band.series_count}
            </p>
            <p className="mt-1.5 text-meta text-ink-tertiary">
              {band.recommended_units > 0
                ? `${formatNumber(band.recommended_units)} units to order`
                : "No order required"}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-5 animate-enter [--enter-delay:260ms]">
        <FilterBar filters={filterSpecs} />
      </div>

      <div className="mt-5 animate-enter-fade [--enter-delay:300ms]">
        <Panel
          title="Inventory vs demand"
          description="Select a row to see why an item is flagged and how its order quantity was reached."
          padded={false}
          footer="Status and recommended quantities come from the decision engine. Sorting and search do not change them."
        >
          <InventoryWorkspace rows={supply.rows} />
        </Panel>
      </div>

      <div className="mt-5 animate-enter [--enter-delay:360ms]">
        <ValuePanel value={value} />
      </div>
    </main>
  );
}

/**
 * Value simulation — the same replenishment policy run under both forecasts
 * across the backtest windows, compared on outcomes rather than error metrics.
 */
function ValuePanel({ value }: { value: ValueSimulation }) {
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
    {
      label: "Average inventory held",
      baseline: formatCurrency(value.avg_inventory_value_baseline),
      model: formatCurrency(value.avg_inventory_value_model),
      better: "lower",
    },
  ];

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
          <p className="mt-1.5 text-metric-lg leading-none font-bold text-brand-deep" data-numeric>
            {formatCurrency(value.net_benefit_idr)}
          </p>
          <p className="mt-2.5 text-meta leading-relaxed text-ink-tertiary">
            Fewer stockouts and less stock held, using the margin and holding cost configured for
            this project. Not a projection of future savings.
          </p>
        </div>
      </div>
    </Panel>
  );
}
