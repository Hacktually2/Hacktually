import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { getProjects } from "@/app/dummy-data";
import type { Project } from "@/app/dummy-data/types";
import { Sparkline } from "@/components/charts/bars";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight, Clock, FileText, Plus, Upload } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/panel";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Projects" };

/** Status vocabulary is fixed here so it cannot drift between surfaces. */
const STATUS = {
  ready: {
    label: "Ready",
    className: "text-status-healthy bg-status-healthy-surface border-status-healthy/25",
    cta: "Open dashboard",
    href: (id: string) => `/projects/${id}/dashboard`,
  },
  needs_review: {
    label: "Needs review",
    className: "text-status-watch bg-status-watch-surface border-status-watch/25",
    cta: "Review mapping",
    href: (id: string) => `/projects/${id}/review`,
  },
  processing: {
    label: "Processing",
    className: "text-brand-blue-ink bg-brand-blue-soft border-brand-blue/25",
    cta: "View progress",
    href: (id: string) => `/projects/${id}/processing`,
  },
  failed: {
    label: "Failed",
    className: "text-status-critical bg-status-critical-surface border-status-critical/25",
    cta: "See error",
    href: (id: string) => `/projects/${id}/review`,
  },
} as const;

export default async function ProjectsPage() {
  const [projects, session] = await Promise.all([getProjects(), getSession()]);

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="animate-enter">
        <PageHeader
          title={`Welcome back, ${session?.name.split(" ")[0] ?? "planner"}`}
          description="Select a project to continue, or start a new analysis from a fresh dataset."
          action={
            <ButtonLink href="/projects/new">
              <Plus size={16} />
              New project
            </ButtonLink>
          }
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {projects.map((project, i) => (
          <div
            key={project.project_id}
            className="animate-enter min-w-0"
            style={{ "--enter-delay": `${80 + i * 60}ms` } as CSSProperties}
          >
            <ProjectCard project={project} />
            {project.status === "ready" && (
              <UpdateDataLink projectId={project.project_id} />
            )}
          </div>
        ))}
        <div
          className="animate-enter min-w-0"
          style={{ "--enter-delay": `${80 + projects.length * 60}ms` } as CSSProperties}
        >
          <NewProjectCard />
        </div>
      </div>
    </main>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const status = STATUS[project.status];
  const isReady = project.status === "ready";

  return (
    <Link
      href={status.href(project.project_id)}
      className="surface-card group flex flex-col p-5 transition-shadow duration-(--duration-base) ease-(--ease-standard) hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-section font-semibold text-brand-deep">
            {project.organisation}
          </h2>
          <p className="mt-0.5 truncate text-body-sm text-ink-secondary">{project.name}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-meta font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-meta text-ink-tertiary">
        <FileText size={14} />
        <span className="truncate">{project.dataset_filename}</span>
        <span className="rounded-xs bg-surface-sunken px-1.5 py-0.5 font-medium text-ink-secondary">
          {project.industry_mode}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-border-subtle py-3">
        <Stat label="Series" value={formatNumber(project.series_total)} />
        <Stat label="Horizon" value={`${project.horizon_days}d`} />
        <Stat
          label="Health"
          value={isReady || project.status === "needs_review" ? `${project.health_score}` : "—"}
        />
      </dl>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-meta text-ink-tertiary">
            <Clock size={13} />
            {project.forecast_generated_at
              ? `Forecast ${formatDateTime(project.forecast_generated_at)}`
              : `Uploaded ${formatDateTime(project.uploaded_at)}`}
          </p>
          <p className="mt-2 flex items-center gap-1 text-body-sm font-semibold text-brand-blue-ink">
            {status.cta}
            <ArrowRight
              size={15}
              className="transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
            />
          </p>
        </div>
        {isReady && (
          <Sparkline
            values={project.demand_sparkline}
            label="Recent demand trend"
            color="var(--color-brand-blue)"
          />
        )}
      </div>
    </Link>
  );
}

/**
 * Sits outside the card link, because a link inside a link is invalid markup
 * and unusable with a keyboard.
 */
function UpdateDataLink({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/update`}
      className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:text-brand-blue-ink"
    >
      <Upload size={14} />
      Update data
    </Link>
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

function NewProjectCard() {
  return (
    <Link
      href="/projects/new"
      className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong/45 p-5 text-center transition-colors duration-(--duration-base) hover:border-brand-blue hover:bg-brand-blue-soft/40"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-pale text-brand-deep">
        <Plus size={20} />
      </span>
      <span className="mt-1 text-body font-semibold text-brand-deep">New project</span>
      <span className="max-w-[16rem] text-body-sm text-ink-secondary">
        Upload a sales export to start a new analysis context.
      </span>
    </Link>
  );
}
