import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getJob, getJobSequence, getProject } from "@/app/dummy-data";
import { requireForecastAccess } from "@/auth/session";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ProcessingProgress } from "./progress";

export const metadata: Metadata = { title: "Processing" };

export default async function ProcessingPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/processing">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  await requireForecastAccess(projectId);
  const [project, sequence] = await Promise.all([getProject(projectId), getJobSequence()]);
  if (!project) notFound();

  // `?job=` is set by the mapping confirmation that queued the run. Without it
  // there is no live job to follow and the screen explains the pipeline instead.
  const raw = query.job;
  const jobId = (Array.isArray(raw) ? raw[0] : raw) ?? null;

  // Read the real job server-side so the first paint is already the backend's
  // own steps. Without this the screen renders the fixture sequence and swaps
  // to live data on the first client poll, which looks like the pipeline
  // restarting.
  const initial = jobId ? (await getJob(jobId)).data : null;

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
            reviewHref={`/projects/${projectId}/dashboard`}
            projectId={projectId}
            jobId={jobId}
            initialJob={initial}
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
