import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDemand, getProject, getSeriesDetail } from "@/app/dummy-data";
import type { DemandResponse } from "@/app/dummy-data/types";
import { BarList, DistributionBar } from "@/components/charts/bars";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { FilterBar, type FilterSpec } from "@/components/dashboard/filter-bar";
import { ForecastTable } from "@/components/dashboard/forecast-table";
import { Info } from "@/components/ui/icons";
import { Field, PageHeader, Panel } from "@/components/ui/panel";
import { DEMAND_COLOR } from "@/components/ui/status";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Demand & Sales" };

export default async function DemandPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/dashboard/demand">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(projectId);
  if (!project) notFound();

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  // Filters go to the data layer, not into the components.
  const demand = await getDemand(project.dataset_id, {
    date_range: one(query.date_range),
    product: one(query.product),
    location: one(query.location),
  });

  const active = demand.active_filters;

  // When the filters name one product at one location, the chart shows that
  // series from GET /forecasts/{dataset}/{series} rather than the portfolio
  // aggregate. Previously this case rendered the aggregate with an apology.
  const seriesId =
    active.product !== "all" && active.location !== "all"
      ? `${active.product}__${active.location}`
      : null;
  const seriesDetail = seriesId ? await getSeriesDetail(project.dataset_id, seriesId) : null;
  const chart = seriesDetail ?? demand.chart;

  const filterSpecs: FilterSpec[] = [
    {
      key: "date_range",
      label: "Historical period",
      options: demand.filters.date_presets,
      value: active.date_range,
      neutral: "18m",
    },
    {
      key: "product",
      label: "Product",
      options: demand.filters.products,
      value: active.product,
      neutral: "all",
    },
    {
      key: "location",
      label: "Location",
      options: demand.filters.locations,
      value: active.location,
      neutral: "all",
    },
  ];

  const scope =
    active.product === "all" && active.location === "all"
      ? "All 428 series"
      : [
          active.product === "all"
            ? null
            : demand.filters.products.find((p) => p.value === active.product)?.label,
          active.location === "all"
            ? null
            : demand.filters.locations.find((l) => l.value === active.location)?.label,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <main className="layout-shell flex-1 py-8">
      <div className="animate-enter">
        <PageHeader
          title="Demand & Sales"
          description="Understand historical demand, inspect the forecast, and see how demand behaves across products and locations."
          context={
            <>
              {project.organisation} · {project.name} · Forecast horizon {demand.horizon_label}
            </>
          }
        />
      </div>

      <div className="mt-5 animate-enter [--enter-delay:60ms]">
        <FilterBar filters={filterSpecs} />
      </div>

      {/* Forecast result first, diagnostics after (design.md §43). */}
      <div className="mt-5 grid animate-enter-fade gap-5 [--enter-delay:140ms] xl:grid-cols-[1.45fr_1fr] xl:items-start">
        <Panel
          title={seriesDetail ? "Actual vs forecast demand" : "Actual vs forecast demand"}
          description={
            seriesDetail ? `Weekly demand · ${seriesDetail.label}` : `Weekly demand · ${scope}`
          }
        >
          <ForecastChart series={chart} height={340} />
          {!seriesDetail && active.product !== "all" && (
            <p className="mt-4 flex items-start gap-2 rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2 text-meta text-ink-secondary">
              <Info size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
              Showing the portfolio total. Choose a location as well to chart this product on
              its own.
            </p>
          )}
        </Panel>

        <ForecastSummary demand={demand} />
      </div>

      <div className="mt-5 grid animate-enter gap-5 [--enter-delay:220ms] lg:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr]">
        <Panel
          title="Demand pattern"
          description="How each series behaves decides which models are allowed to compete for it."
        >
          <DistributionBar
            segments={demand.pattern.classes.map((c) => ({
              key: c.demand_class,
              label: c.label,
              share: c.share_percent,
              count: c.series_count,
            }))}
          />
          <dl className="mt-5 space-y-3 border-t border-border-subtle pt-4">
            {demand.pattern.classes.map((c) => (
              <div key={c.demand_class}>
                <dt className="flex items-center gap-2 text-body-sm font-semibold text-brand-deep">
                  <span
                    className="size-2 rounded-xs"
                    style={{ backgroundColor: DEMAND_COLOR[c.demand_class] }}
                    aria-hidden="true"
                  />
                  {c.label}
                  <span className="text-meta font-normal text-ink-tertiary">
                    typically {c.typical_model}
                  </span>
                </dt>
                <dd className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">
                  {c.description}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Sales by product" description="Volume across the selected period.">
          {demand.sales_by_product.length > 0 ? (
            <BarList items={demand.sales_by_product} accent="var(--color-brand-blue)" />
          ) : (
            <p className="py-8 text-center text-body-sm text-ink-secondary">
              No products match the current filters.
            </p>
          )}
        </Panel>

        <Panel title="Sales by location" description="Where the demand is concentrated.">
          {demand.sales_by_location.length > 0 ? (
            <BarList items={demand.sales_by_location} accent="var(--color-brand-deep)" />
          ) : (
            <p className="py-8 text-center text-body-sm text-ink-secondary">
              No locations match the current filters.
            </p>
          )}
        </Panel>
      </div>

      <div className="mt-5 animate-enter-fade [--enter-delay:300ms]">
        <Panel
          title="Forecast detail"
          description={`${formatNumber(demand.forecast_rows.length)} rows · ${demand.horizon_label}`}
          padded={false}
          footer="Values are model output. Intervals are the 10th and 90th quantiles."
        >
          <ForecastTable rows={demand.forecast_rows} />
        </Panel>
      </div>
    </main>
  );
}

/**
 * Forecast summary and diagnostics. The result is the largest thing here; the
 * model name is deliberately subordinate (design.md §44).
 */
function ForecastSummary({ demand }: { demand: DemandResponse }) {
  const { accuracy } = demand;
  const improvement = accuracy.baseline_wape_percent - accuracy.wape_percent;

  return (
    <div className="space-y-5">
      <Panel title="Forecast accuracy" description={`Validated on ${accuracy.validation_windows} rolling windows.`}>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <p className="text-meta font-medium text-ink-tertiary">WAPE</p>
            <p className="mt-1 text-metric leading-none font-bold text-brand-deep" data-numeric>
              {formatPercent(accuracy.wape_percent)}
            </p>
            <p className="mt-1.5 text-meta text-ink-tertiary">
              Weighted absolute percentage error. Lower is better.
            </p>
          </div>
          <div>
            <p className="text-meta font-medium text-ink-tertiary">Bias</p>
            <p className="mt-1 text-metric leading-none font-bold text-brand-deep" data-numeric>
              {formatPercent(accuracy.bias_percent, true)}
            </p>
            <p className="mt-1.5 text-meta text-ink-tertiary">
              Slight over-forecast on average, reported alongside accuracy.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-border-subtle pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-body-sm text-ink-secondary">
              {accuracy.baseline_name} baseline
            </p>
            <p className="text-body font-semibold text-ink-secondary" data-numeric>
              {formatPercent(accuracy.baseline_wape_percent)}
            </p>
          </div>
          <p className="mt-2 text-body-sm text-ink-secondary">
            <strong className="font-semibold text-brand-deep">
              {formatPercent(improvement)} better
            </strong>{" "}
            than the baseline a planner would otherwise use.
          </p>
        </div>
      </Panel>

      <Panel title="Model selection" description="Chosen by backtest, not by default.">
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Selected model">{accuracy.model_name}</Field>
          <Field label="MASE">{accuracy.mase === null ? "—" : accuracy.mase.toFixed(2)}</Field>
        </dl>
        <p className="mt-4 border-t border-border-subtle pt-4 text-body-sm leading-relaxed text-ink-secondary">
          {accuracy.model_reason}
        </p>
      </Panel>
    </div>
  );
}
