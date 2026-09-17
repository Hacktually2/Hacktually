import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/app/dummy-data";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatDateTime, formatNumber } from "@/lib/format";
import { previewMerge } from "./actions";
import { MergeFlow } from "./merge-flow";

export const metadata: Metadata = { title: "Update data" };

export default async function UpdateDataPage({
  params,
}: PageProps<"/projects/[projectId]/update">) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="animate-enter">
        <PageHeader
          title="Update data"
          description="Add a newer export to this project. Existing history is kept, and rows the new file restates are replaced."
          context={
            <>
              {project.organisation} · {project.name} · currently{" "}
              {formatNumber(project.series_total)} series
            </>
          }
        />
      </div>

      <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <MergeFlow
          projectId={projectId}
          datasetId={project.dataset_id}
          previewFor={previewMerge}
        />

        <div className="space-y-5">
          <Panel title="How merging works" tinted>
            <ol className="space-y-4">
              {[
                {
                  t: "Rows are matched on date and product",
                  d: "The same pair in both files is treated as the same observation, so a restated week corrects itself instead of double counting.",
                },
                {
                  t: "Overlaps take the newer value",
                  d: "Late invoices and adjustments posted after your last export replace what was there.",
                },
                {
                  t: "Nothing is deleted",
                  d: "Rows the new file does not mention are kept exactly as they are.",
                },
                {
                  t: "Forecasts are regenerated",
                  d: "The models were fitted on the old history, so the forecast and every recommendation from it are recalculated.",
                },
              ].map((item) => (
                <li key={item.t}>
                  <p className="text-body-sm font-semibold text-brand-deep">{item.t}</p>
                  <p className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">
                    {item.d}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Current dataset">
            <dl className="space-y-2.5">
              <Row label="File" value={project.dataset_filename} />
              <Row label="Uploaded" value={formatDateTime(project.uploaded_at)} />
              <Row
                label="Last forecast"
                value={
                  project.forecast_generated_at
                    ? formatDateTime(project.forecast_generated_at)
                    : "Not yet run"
                }
              />
              <Row label="Series" value={formatNumber(project.series_total)} />
            </dl>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-meta text-ink-tertiary">{label}</dt>
      <dd className="min-w-0 truncate text-body-sm font-medium text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}
