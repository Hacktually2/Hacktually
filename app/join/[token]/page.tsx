import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActivity } from "@/app/dummy-data";
import {
  getProjectByToken,
  listAccessibleBranches,
  listBranches,
  listRequestsByUser,
} from "@/auth/db";
import { requireSession } from "@/auth/session";
import { WorkspaceHeader } from "@/components/app-shell/workspace-header";
import { ButtonLink } from "@/components/ui/button";
import { Info } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { RequestAccess } from "./request-access";

export const metadata: Metadata = { title: "Request branch access" };

/**
 * The link an owner hands a manager.
 *
 * The token identifies a project; it does not grant anything. A manager who
 * opens it can ask for the branches they run, and the owner still decides. Sign
 * -in is required first, because a request has to come from an account the
 * owner can recognise and approve.
 */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const user = await requireSession();

  const project = getProjectByToken(token);
  if (!project) notFound();

  // The owner following their own link belongs on the team screen, not on a
  // form asking themselves for permission.
  if (project.owner_id === user.id) redirect(`/projects/${project.project_id}/team`);

  const branches = listBranches(project.project_id);
  const granted = new Set(
    listAccessibleBranches(user.id, project.project_id).map((b) => b.id),
  );
  const pending = new Set(
    listRequestsByUser(user.id, project.project_id)
      .filter((r) => r.status === "pending")
      .map((r) => r.branch_id),
  );

  const activity = await getActivity();

  return (
    <>
      <WorkspaceHeader session={user} activityCount={activity.length} />
      <main className="layout-shell flex-1 py-10">
        <PageHeader
          title={`Request access · ${project.name}`}
          description="Select the branches you manage. The project owner reviews every request before anything is shared."
          context={
            <>
              {project.organisation} · {branches.length}{" "}
              {branches.length === 1 ? "branch" : "branches"} ·{" "}
              {formatNumber(project.dataset_rows)} rows
            </>
          }
          action={
            granted.size > 0 ? (
              <ButtonLink href={`/projects/${project.project_id}/team`} variant="secondary">
                Your branches
              </ButtonLink>
            ) : undefined
          }
        />

        {user.role === "owner" ? (
          <Panel className="mt-8" title="This link is for managers">
            <p className="text-body-sm text-ink-secondary">
              You are signed in as an owner. Owners hold their own projects rather than
              requesting access to someone else&rsquo;s.
            </p>
          </Panel>
        ) : (
          <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <Panel
              title="Branches in this project"
              description="Already-approved branches are not selectable — you have them."
            >
              <RequestAccess
                projectId={project.project_id}
                branches={branches}
                grantedIds={[...granted]}
                pendingIds={[...pending]}
              />
            </Panel>

            <div className="space-y-5">
              <Panel title="What the owner sees">
                <p className="text-body-sm leading-relaxed text-ink-secondary">
                  Your name, your email, the branches you asked for and your note. They
                  approve or reject each branch, and approval takes effect on your next page
                  load.
                </p>
              </Panel>

              <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
                <Info size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
                <p className="text-body-sm leading-relaxed text-ink-secondary">
                  Having this link does not give you data. Until a branch is approved you
                  cannot see a single row of it.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
