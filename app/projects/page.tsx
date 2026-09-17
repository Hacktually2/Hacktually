import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { getProjects } from "@/app/dummy-data";
import type { Project } from "@/app/dummy-data/types";
import {
  listBranches,
  listProjectsForUser,
  visibleForecastProjects,
  type Project as AuthProject,
} from "@/auth/db";
import { Sparkline } from "@/components/charts/bars";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight, Check, Clock, FileText, Layers, Plus, Upload, Users } from "@/components/ui/icons";
import { DataSource } from "@/components/ui/data-source";
import { PageHeader } from "@/components/ui/panel";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { backend } from "@/lib/backend/client";
import { attempt } from "@/lib/backend/source";
import { requireSession } from "@/lib/session";

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
  const session = await requireSession();
  const { data: projects, note: projectsNote } = await getProjects(session.organisation);
  const isOwner = session.role === "owner";
  // Owned projects for an owner, branch-granted ones for a manager. `db.ts`
  // decides which; this page only renders the answer.
  const mine = listProjectsForUser(session);
  // The branch dashboards this person may open. An owner gets every branch of
  // their network; a manager gets the ones approved for them, and the rest are
  // not listed at all.
  const allowed = visibleForecastProjects(
    session.id,
    projects.map((p) => p.project_id),
  );
  const branchDashboards = projects.filter((p) => allowed.has(p.project_id));

  // The network figure belongs here, not only behind a click. An owner opening
  // this page wants the one number for the whole company before they pick a
  // branch, and making them find the merged dashboard to get it is the sort of
  // thing that turns a product into a tool people stop opening.
  //
  // Only for projects whose branches share a dataset, and every call is
  // best-effort: a project wired to fixture ids answers nothing and its card
  // renders exactly as before.
  const summaries = new Map<string, NetworkSummary>();
  await Promise.all(
    mine.map(async (project) => {
      const branches = listBranches(project.project_id);
      const ids = new Set(
        branches.map((b) => b.forecast_project_id).filter((id): id is string => !!id),
      );
      if (ids.size !== 1) return;
      const datasetId = [...ids][0];

      const [insight, rollup] = await Promise.all([
        attempt(() => backend.getBranches(datasetId)),
        attempt(() => backend.getHierarchy(datasetId)),
      ]);
      if (!insight.ok) return;

      summaries.set(project.project_id, {
        datasetId,
        series: insight.data.network.series,
        attentionRatePercent: insight.data.network.attention_rate_percent,
        medianWapePercent: insight.data.network.median_wape_percent,
        horizonTotal: rollup.ok ? rollup.data.network.horizon_total : null,
        coherent: rollup.ok ? (rollup.data.coherence?.coherent ?? null) : null,
      });
    }),
  );

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="animate-enter">
        <PageHeader
          title={`Welcome back, ${session.name.split(" ")[0]}`}
          description={
            isOwner
              ? "Select a project to continue, or start a new analysis from a fresh dataset."
              : "The projects you have been given branches in."
          }
          action={
            isOwner ? (
              <ButtonLink href="/projects/new">
                <Plus size={16} />
                New project
              </ButtonLink>
            ) : undefined
          }
        />
      </div>

      <section className="mt-8">
        <h2 className="text-section font-semibold text-brand-deep">
          {isOwner ? "Your projects" : "Shared with you"}
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 max-w-xl text-body-sm text-ink-secondary">
            {isOwner
              ? "Nothing yet. Upload a sales export and confirm which column identifies the branch — the project and its branches are created from that."
              : "Nothing yet. Open the project link your owner sent you and request the branches you manage."}
          </p>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {mine.map((project, i) => (
              <div
                key={project.project_id}
                className="animate-enter min-w-0"
                style={{ "--enter-delay": `${60 + i * 50}ms` } as CSSProperties}
              >
                <AuthProjectCard
                  project={project}
                  isOwner={isOwner}
                  summary={summaries.get(project.project_id) ?? null}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <h2 className="mt-12 text-section font-semibold text-brand-deep">Branch dashboards</h2>
      <DataSource note={projectsNote} className="mt-2 max-w-xl" />
      <p className="mt-1 max-w-xl text-body-sm text-ink-secondary">
        {isOwner
          ? "Every branch in your network. Forecasts, demand and inventory per branch."
          : `${branchDashboards.length} of your branches are ready to open.`}
      </p>

      {branchDashboards.length === 0 ? (
        <p className="mt-4 max-w-xl rounded-md border border-dashed border-border-strong/45 px-4 py-6 text-body-sm text-ink-secondary">
          No branch has been approved for you yet. Once an owner approves one, its dashboard
          appears here.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {branchDashboards.map((project, i) => (
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
        </div>
      )}
    </main>
  );
}

export interface NetworkSummary {
  datasetId: string;
  series: number;
  attentionRatePercent: number;
  medianWapePercent: number | null;
  /** Units forecast across the whole network for the horizon. */
  horizonTotal: number | null;
  /** Whether the branch totals add up to the network total. */
  coherent: boolean | null;
}

/**
 * A project this workspace owns or manages, as opposed to a fixture.
 *
 * Deliberately **not** one big link any more. It used to be a single click
 * target to team-and-access with the branch network tacked underneath as a
 * small text link, which got the emphasis backwards: the network is what an
 * owner opens daily, and access is what they configure once. A link cannot
 * contain another link, so the card had no way to offer both properly until it
 * stopped being one.
 *
 * The network numbers are here rather than only inside the map, because the
 * first question is "how is the company" and the second is "which branch".
 */
function AuthProjectCard({
  project,
  isOwner,
  summary,
}: {
  project: AuthProject;
  isOwner: boolean;
  summary: NetworkSummary | null;
}) {
  const branches = listBranches(project.project_id);

  return (
    <div className="surface-card flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-section font-semibold text-brand-deep">
            {project.organisation}
          </h3>
          <p className="mt-0.5 truncate text-body-sm text-ink-secondary">{project.name}</p>
        </div>
        <span className="shrink-0 rounded-full border border-brand-blue/25 bg-brand-blue-soft px-2 py-0.5 text-meta font-semibold text-brand-blue-ink">
          {isOwner ? "Owner" : "Manager"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-meta text-ink-tertiary">
        <FileText size={14} />
        <span className="truncate">{project.dataset_filename}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-border-subtle py-3">
        <Stat label="Branches" value={formatNumber(branches.length)} />
        <Stat label="Rows" value={formatNumber(project.dataset_rows)} />
      </dl>

      {summary && (
        <div className="mt-4 rounded-md border border-border-subtle bg-surface-sunken/40 p-4">
          <p className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
            Whole network, next 30 days
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-3">
            {summary.horizonTotal !== null && (
              <Stat
                label="Forecast demand"
                value={`${formatNumber(Math.round(summary.horizonTotal))} units`}
              />
            )}
            <Stat
              label="Needs attention"
              value={formatPercent(summary.attentionRatePercent)}
            />
          </dl>
          {summary.coherent && (
            <p className="mt-2.5 flex items-start gap-1.5 text-meta text-ink-tertiary">
              <Check size={12} className="mt-0.5 shrink-0 text-status-healthy" />
              Branch totals add up to this figure — it is their sum, not a separate
              estimate.
            </p>
          )}
        </div>
      )}

      {/* Two destinations, two buttons. The network first. */}
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <ButtonLink href={`/projects/${project.project_id}/network`} size="sm">
          <Layers size={15} />
          {isOwner ? "Branch network" : "Your branch"}
        </ButtonLink>
        {summary && (
          <ButtonLink
            href={`/projects/${summary.datasetId}/dashboard`}
            variant="secondary"
            size="sm"
          >
            <ArrowRight size={15} />
            Merged dashboard
          </ButtonLink>
        )}
        <ButtonLink
          href={`/projects/${project.project_id}/team`}
          variant="ghost"
          size="sm"
        >
          <Users size={15} />
          {isOwner ? "Team & access" : "Your branches"}
        </ButtonLink>
      </div>
    </div>
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
          <h3 className="truncate text-section font-semibold text-brand-deep">
            {project.name}
          </h3>
          <p className="mt-0.5 truncate text-body-sm text-ink-secondary">
            {project.organisation}
          </p>
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

