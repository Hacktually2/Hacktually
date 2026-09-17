import Link from "next/link";
import type { Project } from "@/app/dummy-data/types";
import { ChevronDown, Database, Plus } from "@/components/ui/icons";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DashboardTabs } from "./dashboard-tabs";

/**
 * Second-level chrome: which dataset am I looking at, and how fresh is it
 * (frontend_user_flow.md §55, §56). Upload time and forecast time are shown
 * separately because they are genuinely different moments.
 */
export function ProjectBar({
  project,
  projects,
  showTabs = true,
}: {
  project: Project;
  projects: Project[];
  showTabs?: boolean;
}) {
  const base = `/projects/${project.project_id}/dashboard`;

  return (
    <div className="glass-navigation sticky top-14 z-[var(--z-sticky)]">
      <div className="layout-shell flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-brand-pale-soft">
              <Database size={16} className="shrink-0 text-brand-blue" />
              <span className="min-w-0 text-left">
                <span className="block truncate text-body-sm leading-tight font-semibold text-brand-deep">
                  {project.organisation}
                </span>
                <span className="block truncate text-meta leading-tight text-ink-tertiary">
                  {project.name} · {project.dataset_filename}
                </span>
              </span>
              <ChevronDown size={16} className="shrink-0 text-ink-tertiary" />
            </summary>

            <div className="glass-overlay absolute left-0 z-[var(--z-popover)] mt-2 w-80 rounded-md p-2">
              <p className="px-2 py-1.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
                Switch project
              </p>
              {projects.map((p) => (
                <Link
                  key={p.project_id}
                  href={
                    p.status === "ready"
                      ? `/projects/${p.project_id}/dashboard`
                      : `/projects/${p.project_id}/review`
                  }
                  className={`block rounded-sm px-2 py-2 transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft ${
                    p.project_id === project.project_id ? "bg-brand-pale-soft" : ""
                  }`}
                >
                  <span className="block text-body-sm font-semibold text-brand-deep">
                    {p.organisation}
                  </span>
                  <span className="block text-meta text-ink-tertiary">
                    {p.name} · {formatNumber(p.series_total)} series
                  </span>
                </Link>
              ))}
              <Link
                href="/projects/new"
                className="mt-1 flex items-center gap-2 border-t border-border-subtle px-2 py-2.5 text-body-sm font-semibold text-brand-blue hover:text-brand-blue-hover"
              >
                <Plus size={15} />
                New project
              </Link>
            </div>
          </details>

          <span className="hidden h-8 w-px bg-border-default lg:block" />

          <dl className="hidden gap-x-5 text-meta lg:flex">
            <div>
              <dt className="text-ink-tertiary">Forecast generated</dt>
              <dd className="font-semibold text-ink" data-numeric>
                {project.forecast_generated_at
                  ? formatDateTime(project.forecast_generated_at)
                  : "Not yet run"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">Horizon</dt>
              <dd className="font-semibold text-ink" data-numeric>
                {project.horizon_days} days
              </dd>
            </div>
            <div>
              <dt className="text-ink-tertiary">Data health</dt>
              <dd className="font-semibold text-ink" data-numeric>
                {project.health_score}/100
              </dd>
            </div>
          </dl>
        </div>

        {showTabs && <DashboardTabs base={base} />}
      </div>
    </div>
  );
}
