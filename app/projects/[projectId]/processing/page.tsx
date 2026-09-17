import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getJobSequence, getProject } from "@/app/dummy-data";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ProcessingProgress } from "./progress";

export const metadata: Metadata = { title: "Processing" };

export default async function ProcessingPage({
  params,
}: PageProps<"/projects/[projectId]/processing">) {
  const { projectId } = await params;
  const [project, sequence] = await Promise.all([getProject(projectId), getJobSequence()]);
  if (!project) notFound();

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title="Processing dataset"
        description="The file is being profiled, cleaned and forecast. Each step is reported as it completes."
        context={
          <>
            {project.organisation} · {project.dataset_filename}
          </>
        }
      />

      <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel>
          <ProcessingProgress
            sequence={sequence}
            reviewHref={`/projects/${projectId}/review`}
          />
        </Panel>

        <Panel title="What happens here" tinted>
          <ol className="space-y-4">
            {[
              {
                t: "Profiling",
                d: "Column types, null ratios, cardinality and sample values are inspected to work out what each column means.",
              },
              {
                t: "Cleaning",
                d: "Duplicate rows are aggregated, the time axis is completed at the detected frequency, and returns are flagged rather than silently dropped.",
              },
              {
                t: "Classification",
                d: "Each series is measured for demand interval and variability, which decides the models allowed to compete for it.",
              },
              {
                t: "Forecast and validation",
                d: "Candidates are backtested across two rolling windows. The selected model is the one that won on your history, not a default.",
              },
            ].map((item) => (
              <li key={item.t}>
                <p className="text-body-sm font-semibold text-brand-deep">{item.t}</p>
                <p className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">{item.d}</p>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </main>
  );
}
