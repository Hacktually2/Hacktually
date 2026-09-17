import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOverview, getProject } from "@/app/dummy-data";
import type { InventoryPosture, PriorityAction } from "@/app/dummy-data/types";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ArrowRight } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { RiskBadge } from "@/components/ui/status";
import { formatDateTime, formatDays, formatNumber } from "@/lib/format";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

const RISK_FILL = {
  critical: "bg-status-critical",
  at_risk: "bg-status-risk",
  watch: "bg-status-watch",
  healthy: "bg-status-healthy",
} as const;

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" })
  );
  if (hour < 11) return "Good morning";
  if (hour < 15) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage({
  params,
}: PageProps<"/projects/[projectId]/dashboard">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const [overview, session] = await Promise.all([getOverview(project.dataset_id), getSession()]);

  return (
    <main className="layout-shell flex-1 py-8">
      <div className="animate-enter">
        <PageHeader
          title={`${greeting()}${session ? `, ${session.name.split(" ")[0]}` : ""}`}
          description={`Here is the current demand and inventory outlook for ${project.organisation}.`}
          context={<>Last processed {formatDateTime(overview.generated_at)}</>}
        />
      </div>

      {/* Primary KPI row */}
      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        {overview.kpis.map((kpi, i) => (
          <div
            key={kpi.key}
            className="animate-enter"
            style={{ "--enter-delay": `${60 + i * 45}ms` } as CSSProperties}
          >
            <KpiCard kpi={kpi} />
          </div>
        ))}
      </section>

      {/* The main visualisation */}
      <div className="mt-5 animate-enter-fade [--enter-delay:260ms]">
        <Panel
          title="Actual vs forecast demand"
          description="Aggregate daily demand across all forecastable series."
          action={
            <Link
              href={`/projects/${projectId}/dashboard/demand`}
              className="flex items-center gap-1 text-body-sm font-semibold text-brand-blue hover:text-brand-blue-hover"
            >
              Investigate demand
              <ArrowRight size={15} />
            </Link>
          }
        >
          <ForecastChart series={overview.demand_chart} height={320} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.25fr] lg:items-start">
        <div className="animate-enter [--enter-delay:320ms]">
          <InventoryPanel posture={overview.inventory} projectId={projectId} />
        </div>
        <div className="animate-enter [--enter-delay:380ms]">
          <PriorityPanel actions={overview.priority_actions} projectId={projectId} />
        </div>
      </div>
    </main>
  );
}

function InventoryPanel({
  posture,
  projectId,
}: {
  posture: InventoryPosture;
  projectId: string;
}) {
  return (
    <Panel
      title="Inventory posture"
      description="How stock stands against expected demand."
      footer={
        <Link
          href={`/projects/${projectId}/dashboard/supply-chain`}
          className="flex items-center gap-1 font-semibold text-brand-blue hover:text-brand-blue-hover"
        >
          Open supply chain
          <ArrowRight size={15} />
        </Link>
      }
    >
      <div className="flex h-3 w-full overflow-hidden rounded-xs" role="presentation">
        {posture.bands.map((band) => (
          <div
            key={band.risk}
            className={RISK_FILL[band.risk]}
            style={{ width: `${(band.series_count / posture.total_series) * 100}%` }}
            title={`${band.label}: ${band.series_count}`}
          />
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        {posture.bands.map((band) => (
          <div key={band.risk} className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-body-sm text-ink-secondary">
              <span
                className={`size-2 rounded-xs ${RISK_FILL[band.risk]}`}
                aria-hidden="true"
              />
              {band.label}
            </dt>
            <dd className="text-body font-semibold text-ink" data-numeric>
              {band.series_count}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 border-t border-border-subtle pt-4 text-body leading-relaxed text-ink-secondary">
        {posture.narrative}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-meta text-ink-tertiary">Median cover</dt>
          <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
            {formatDays(posture.median_coverage_days)}
          </dd>
        </div>
        <div>
          <dt className="text-meta text-ink-tertiary">Inventory value</dt>
          <dd className="mt-0.5 text-body font-semibold text-ink-disabled">
            {posture.inventory_value.available
              ? formatNumber(posture.inventory_value.value)
              : "Unavailable"}
          </dd>
          {!posture.inventory_value.available && (
            <p className="mt-0.5 text-meta text-ink-tertiary">
              {posture.inventory_value.reason}
            </p>
          )}
        </div>
      </dl>
    </Panel>
  );
}

function PriorityPanel({
  actions,
  projectId,
}: {
  actions: PriorityAction[];
  projectId: string;
}) {
  return (
    <Panel
      title="Priority actions"
      description="The exceptions worth a decision this week, ranked."
      padded={false}
      footer={
        <Link
          href={`/projects/${projectId}/dashboard/supply-chain?risk=attention`}
          className="flex items-center gap-1 font-semibold text-brand-blue hover:text-brand-blue-hover"
        >
          See all items needing attention
          <ArrowRight size={15} />
        </Link>
      }
    >
      <ol className="divide-y divide-border-subtle border-t border-border-subtle">
        {actions.map((action) => (
          <li key={action.series_id}>
            <Link
              href={action.href}
              className="group flex items-start gap-4 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft"
            >
              <span
                className="mt-0.5 w-4 shrink-0 text-body-sm font-bold text-ink-tertiary"
                data-numeric
              >
                {action.rank}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-body font-semibold text-brand-deep">{action.headline}</p>
                  <RiskBadge risk={action.risk} size="sm" />
                </div>
                <p className="mt-0.5 text-body-sm font-medium text-ink">
                  {action.item_name}
                  <span className="font-normal text-ink-tertiary"> · {action.location}</span>
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-ink-secondary">
                  {action.reason}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-body font-bold text-brand-deep" data-numeric>
                  {action.metric_unit === "days"
                    ? formatDays(action.metric_value)
                    : formatNumber(action.metric_value)}
                </p>
                <p className="text-meta text-ink-tertiary">{action.metric_label}</p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
