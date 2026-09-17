import { notFound } from "next/navigation";
import { getProject, getProjects } from "@/app/dummy-data";
import { ProjectBar } from "@/components/app-shell/project-bar";

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
  const [project, projects] = await Promise.all([getProject(projectId), getProjects()]);
  if (!project) notFound();

  return (
    <>
      <ProjectBar project={project} projects={projects} />
      {children}
    </>
  );
}
