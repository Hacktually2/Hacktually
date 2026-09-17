import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHealth, getMapping, getProject } from "@/app/dummy-data";
import type { HealthReport } from "@/app/dummy-data/types";
import { AlertTriangle, Check, Info } from "@/components/ui/icons";
import { requireForecastAccess } from "@/auth/session";
import { DataSource } from "@/components/ui/data-source";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { MappingReview } from "./mapping-review";

export const metadata: Metadata = { title: "Review dataset" };

export default async function ReviewPage({ params }: PageProps<"/projects/[projectId]/review">) {
  const { projectId } = await params;
  await requireForecastAccess(projectId);
  const project = await getProject(projectId);
  if (!project) notFound();

  const [{ data: mapping, note: mappingNote }, { data: health, note: healthNote }] =
    await Promise.all([getMapping(project.dataset_id), getHealth(project.dataset_id)]);

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title="Review detected columns"
        description="Confirm what each column means before forecasting. Nothing runs on an interpretation you have not approved."
        context={
          <>
            {project.organisation} · {project.dataset_filename} ·{" "}
            {formatNumber(health.rows_received)} rows
          </>
        }
      />

      <DataSource note={mappingNote ?? healthNote} className="mt-5" />

      {mapping.preset_matched && (
        <p className="mt-6 flex items-start gap-2.5 rounded-md border border-brand-blue/20 bg-brand-blue-soft px-4 py-3 text-body-sm text-brand-deep">
          <Check size={16} className="mt-0.5 shrink-0 text-brand-blue-ink" />
          <span>
            Recognised as <strong className="font-semibold">{mapping.preset_matched}</strong>.
            Most columns mapped without inference.
          </span>
        </p>
      )}

      <div className="mt-6 grid animate-enter gap-5 [--enter-delay:80ms] xl:grid-cols-[1.55fr_1fr] xl:items-start">
        <Panel
          title="Column mapping"
          description="Change any interpretation that does not match your system."
        >
          <MappingReview
            mapping={mapping}
            projectId={projectId}
            datasetId={project.dataset_id}
            mode={project.industry_mode}
          />
        </Panel>

        <DataHealth health={health} />
      </div>
    </main>
  );
}

function DataHealth({ health }: { health: HealthReport }) {
  return (
    <div className="space-y-5">
      <Panel
        title="Data health"
        description="A forecast is not equally trustworthy regardless of the data behind it."
      >
        <div className="flex items-end gap-4">
          <p className="text-metric-lg leading-none font-bold text-brand-deep" data-numeric>
            {health.health_score}
            <span className="text-section font-semibold text-ink-tertiary">/100</span>
          </p>
          <div className="mb-1 flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-brand-blue"
                style={{ width: `${health.health_score}%` }}
              />
            </div>
            <p className="mt-1.5 text-meta text-ink-tertiary">
              {health.detected_frequency} frequency · {health.history_span_months} months of
              history
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border-subtle pt-4">
          <Stat label="Rows received" value={formatNumber(health.rows_received)} />
          <Stat label="Series found" value={formatNumber(health.series_total)} />
          <Stat label="Forecastable" value={formatNumber(health.series_forecastable)} />
          <Stat label="Duplicates aggregated" value={formatNumber(health.duplicates_found)} />
          <Stat label="Dates reindexed" value={formatNumber(health.missing_timestamps)} />
          <Stat label="Returns flagged" value={formatNumber(health.negative_values)} />
        </dl>
      </Panel>

      <Panel title="What we found" description="Ordered by what would affect your decisions most.">
        <ul className="space-y-4">
          {health.findings.map((finding) => (
            <li key={finding.id} className="flex gap-3">
              {finding.severity === "warning" ? (
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-watch" />
              ) : (
                <Info size={16} className="mt-0.5 shrink-0 text-ink-tertiary" />
              )}
              <div>
                <p className="text-body-sm font-semibold text-ink">{finding.title}</p>
                <p className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">
                  {finding.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Excluded from forecasting"
        description={`${health.series_excluded.length} of ${formatNumber(
          health.series_total
        )} series have too little history to validate against.`}
      >
        <ul className="divide-y divide-border-subtle">
          {health.series_excluded.map((s) => (
            <li key={s.series_id} className="flex items-baseline justify-between gap-4 py-2">
              <code className="text-body-sm font-medium text-ink">{s.series_id}</code>
              <span className="text-right text-meta text-ink-tertiary">{s.reason}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-meta text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}
