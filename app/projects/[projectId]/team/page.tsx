import type { Metadata } from "next";
import Link from "next/link";
import { listMemberships, listRequests, listRequestsByUser } from "@/auth/db";
import { decideRequest, revokeBranch } from "@/auth/actions";
import { requireProjectAccess } from "@/auth/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertTriangle, Check, Clock, Database, Layers, Shield, X } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { CopyLink } from "./copy-link";
import { InviteManager } from "./invite-manager";

export const metadata: Metadata = { title: "Team & access" };

/**
 * Who can see which branch.
 *
 * One route, two products. An owner sees the whole project and every decision
 * they can make on it; a manager sees only the branches they hold and the ones
 * they are waiting on. `requireProjectAccess` decides which, and a manager with
 * no branch in this project never gets here at all.
 */
export default async function TeamPage({ params }: PageProps<"/projects/[projectId]/team">) {
  const { projectId } = await params;
  const { user, project, branches, isOwner } = await requireProjectAccess(projectId);

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title={project.name}
        description={
          isOwner
            ? "You own this project. Managers see only the branches you approve."
            : "The branches you manage in this project."
        }
        context={
          <>
            {project.organisation} · {project.dataset_filename} ·{" "}
            {formatNumber(project.dataset_rows)} rows · {branches.length}{" "}
            {branches.length === 1 ? "branch" : "branches"}
          </>
        }
        action={
          <ButtonLink href={`/projects/${projectId}/dashboard`} variant="secondary">
            Open dashboard
          </ButtonLink>
        }
      />

      {isOwner ? (
        <OwnerView projectId={projectId} project={project} branches={branches} />
      ) : (
        <ManagerView projectId={projectId} userId={user.id} branches={branches} />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------- owner */

type Branches = Awaited<ReturnType<typeof requireProjectAccess>>["branches"];
type Project = Awaited<ReturnType<typeof requireProjectAccess>>["project"];

function OwnerView({
  projectId,
  project,
  branches,
}: {
  projectId: string;
  project: Project;
  branches: Branches;
}) {
  const pending = listRequests(projectId, "pending");
  const members = listMemberships(projectId);

  // Which managers hold each branch, so the branch table answers "who sees
  // this" without the owner cross-referencing two lists.
  const holders = new Map<string, string[]>();
  for (const member of members) {
    for (const branch of member.branches) {
      holders.set(branch.id, [...(holders.get(branch.id) ?? []), member.name]);
    }
  }

  return (
    <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] xl:grid-cols-[1.5fr_1fr] xl:items-start">
      <div className="space-y-5">
        <Panel
          title="Pending access requests"
          description={
            pending.length === 0
              ? "Nothing waiting on you."
              : `${pending.length} ${pending.length === 1 ? "request" : "requests"} from managers who opened your project link.`
          }
        >
          {pending.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-body-sm text-ink-secondary">
              <Check size={16} className="text-status-healthy" />
              Every request has been decided.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {pending.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-ink">
                      {request.user_name}
                      <span className="ml-1.5 font-normal text-ink-tertiary">
                        {request.user_email}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-secondary">
                      <Layers size={13} />
                      Asking for {request.branch_code} · {request.branch_location}
                    </p>
                    {request.note && (
                      <p className="mt-1 text-meta text-ink-tertiary italic">
                        &ldquo;{request.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Decision
                      projectId={projectId}
                      requestId={request.id}
                      decision="approved"
                      label="Approve"
                    />
                    <Decision
                      projectId={projectId}
                      requestId={request.id}
                      decision="rejected"
                      label="Reject"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Branches"
          description="Each one has its own forecast. Open a branch to see its demand and inventory."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-default">
                  {["Branch", "Location", "Products", "Rows", "Managers"].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className="px-5 py-2.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-5 py-2.5 text-body-sm font-medium text-ink">
                      {branch.forecast_project_id ? (
                        <Link
                          href={`/projects/${branch.forecast_project_id}/dashboard`}
                          className="font-semibold text-brand-blue-ink hover:underline"
                        >
                          {branch.code}
                        </Link>
                      ) : (
                        branch.code
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-body-sm text-ink-secondary">
                      {branch.location}
                    </td>
                    <td className="px-5 py-2.5 text-body-sm text-ink-secondary" data-numeric>
                      {formatNumber(branch.product_count)}
                    </td>
                    <td className="px-5 py-2.5 text-body-sm text-ink-secondary" data-numeric>
                      {formatNumber(branch.row_count)}
                    </td>
                    <td className="px-5 py-2.5 text-body-sm text-ink-secondary">
                      {holders.get(branch.id)?.join(", ") ?? (
                        <span className="text-ink-tertiary">Owner only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Managers"
          description="Each manager reaches only what is listed against their name."
        >
          {members.length === 0 ? (
            <p className="py-2 text-body-sm text-ink-secondary">
              Nobody yet. Invite a manager, or send them the project link so they can ask for
              the branches they run.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {members.map((member) => (
                <li key={member.user_id} className="py-3.5 first:pt-0">
                  <p className="text-body-sm font-semibold text-ink">
                    {member.name}
                    <span className="ml-1.5 font-normal text-ink-tertiary">{member.email}</span>
                  </p>
                  {member.branches.length === 0 ? (
                    <p className="mt-1 flex items-center gap-1.5 text-meta text-status-watch">
                      <Clock size={13} />
                      No branches yet · {member.pending} waiting on your decision
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {member.branches.map((branch) => (
                        <li key={branch.id}>
                          <form action={revokeBranch} className="contents">
                            <input type="hidden" name="project_id" value={projectId} />
                            <input type="hidden" name="user_id" value={member.user_id} />
                            <input type="hidden" name="branch_id" value={branch.id} />
                            <button
                              type="submit"
                              className="group flex items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-1 text-meta font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:border-status-critical/40 hover:text-status-critical"
                            >
                              {branch.code} · {branch.location}
                              <X size={12} aria-hidden={false} aria-label="Revoke" />
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel
          title="Project link"
          description="Managers who open this can ask for the branches they run. It grants nothing on its own."
        >
          <CopyLink token={project.invite_token} />
        </Panel>

        <Panel
          title="Register a manager"
          description="Adds them directly, without waiting for a request."
        >
          <InviteManager projectId={projectId} branches={branches} />
        </Panel>

        <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
          <Shield size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
          <p className="text-body-sm leading-relaxed text-ink-secondary">
            Access is checked on every request, not at sign-in. Revoking a branch takes effect
            on the manager&rsquo;s next page load.
          </p>
        </div>
      </div>
    </div>
  );
}

function Decision({
  projectId,
  requestId,
  decision,
  label,
}: {
  projectId: string;
  requestId: string;
  decision: "approved" | "rejected";
  label: string;
}) {
  return (
    <form action={decideRequest}>
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" size="sm" variant={decision === "approved" ? "primary" : "secondary"}>
        {label}
      </Button>
    </form>
  );
}

/* ----------------------------------------------------------------- manager */

function ManagerView({
  projectId,
  userId,
  branches,
}: {
  projectId: string;
  userId: string;
  branches: Branches;
}) {
  const requests = listRequestsByUser(userId, projectId);
  const outstanding = requests.filter((r) => r.status !== "approved");

  return (
    <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <Panel
        title="Your branches"
        description="What you can update and forecast in this project."
      >
        <ul className="divide-y divide-border-subtle">
          {branches.map((branch) => {
            const row = (
              <>
                <div>
                  <p className="text-body-sm font-semibold text-ink">{branch.location}</p>
                  <p className="text-meta text-ink-tertiary">{branch.code}</p>
                </div>
                <p
                  className="flex items-center gap-1.5 text-meta text-ink-secondary"
                  data-numeric
                >
                  <Database size={13} />
                  {formatNumber(branch.product_count)} products ·{" "}
                  {formatNumber(branch.row_count)} rows
                </p>
              </>
            );
            return (
              <li key={branch.id} className="first:pt-0">
                {branch.forecast_project_id ? (
                  <Link
                    href={`/projects/${branch.forecast_project_id}/dashboard`}
                    className="-mx-2 flex items-center justify-between gap-4 rounded-sm px-2 py-3 transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft/60"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-4 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="Requests"
        description={
          outstanding.length === 0
            ? "Nothing outstanding."
            : "Waiting on the project owner."
        }
      >
        {outstanding.length === 0 ? (
          <p className="text-body-sm text-ink-secondary">
            Need another branch? Ask the owner for the project link and request it there.
          </p>
        ) : (
          <ul className="space-y-3">
            {outstanding.map((request) => (
              <li key={request.id} className="flex items-start gap-2.5">
                {request.status === "pending" ? (
                  <Clock size={15} className="mt-0.5 shrink-0 text-status-watch" />
                ) : (
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-critical" />
                )}
                <div>
                  <p className="text-body-sm font-medium text-ink">
                    {request.branch_code} · {request.branch_location}
                  </p>
                  <p className="text-meta text-ink-tertiary">
                    {request.status === "pending"
                      ? "Waiting for the owner to decide."
                      : "The owner declined this request."}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
