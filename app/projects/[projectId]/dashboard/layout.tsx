import { notFound } from "next/navigation";
import { getProject, getProjects } from "@/app/dummy-data";
import { ProjectBar } from "@/components/app-shell/project-bar";
import { ownsDemoNetwork, visibleForecastProjects } from "@/auth/db";
import { requireForecastAccess } from "@/auth/session";

/**
 * Dashboard shell (frontend_user_flow.md §42).
 *
 * Persistent across the three tabs, so switching sections never feels like
 * entering a different application — and never re-runs a forecast. Tab changes
 * are data reads against stored results.
 */
export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/projects/[projectId]/dashboard">) {
  const { projectId } = await params;
  // Branch access, before any of this branch's numbers are read.
  const user = await requireForecastAccess(projectId);
  const [project, { data: projects }] = await Promise.all([
    getProject(projectId),
    getProjects({ demoFixtures: ownsDemoNetwork(user.id) }),
  ]);
  if (!project) notFound();

  // The switcher offers only branches this person can actually open. Listing
  // one they cannot would name a branch they are not entitled to know about,
  // and hand them a link that 404s.
  const allowed = visibleForecastProjects(
    user.id,
    projects.map((p) => p.project_id),
  );

  return (
    <>
      <ProjectBar
        project={project}
        projects={projects.filter((p) => allowed.has(p.project_id))}
      />
      {children}
    </>
  );
}
