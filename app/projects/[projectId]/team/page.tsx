import type { Metadata } from "next";
import Link from "next/link";
import {
  getCompanyToken,
  listCompanyMembers,
  listMemberships,
  listRequests,
  listRequestsByUser,
} from "@/auth/db";
import { RequestAccess } from "@/components/app-shell/request-access";
import { decideRequest, revokeBranch } from "@/auth/actions";
import { projectAccessFor } from "@/auth/session";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertTriangle, Check, Clock, Database, Layers, Shield, X } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { AgentAccess } from "./agent-access";
import { CompanyToken } from "./company-token";
import { CopyLink } from "./copy-link";
import { InviteManager } from "./invite-manager";

export const metadata: Metadata = { title: "Team & access" };

/**
 * Who can see which branch.
 *
 * One route, three products, decided by what the visitor holds here:
 *
 *   owner     the whole project and every decision they can make on it
 *   member    the branches they hold, and what they are still waiting on
 *   outsider  the branch list, and a form to ask for some of it
 *
 * The third one is why this page does not refuse strangers. A project id is
 * the shareable link: an owner sends it to a new branch manager, who opens it,
 * sees the branches and asks for the ones they run. Refusing them would mean
 * every request had to begin with a secret token, which is a worse product and
 * no safer — the invite link discloses exactly the same list.
 *
 * An outsider sees branch names and sizes. Not a single forecast, recommendation
 * or row: those go through `requireForecastAccess`, which is unchanged.
 */
export default async function TeamPage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/team">) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const { user, project, branches, allBranches, isOwner, isMember } =
    await projectAccessFor(projectId);

  // Agent access is an owner decision — a connected agent is not branch-scoped,
  // so showing it to a manager would hand them a way around their own grant.
  const raw = query.tab;
  const tab = (Array.isArray(raw) ? raw[0] : raw) === "agent" && isOwner ? "agent" : "people";

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title={project.name}
        description={
          isOwner
            ? "You own this project. Managers see only the branches you approve."
            : isMember
              ? "The branches you manage in this project."
              : "You do not manage any branch here yet. Ask the owner for the ones you run."
        }
        context={
          <>
            {project.organisation} · {project.dataset_filename} ·{" "}
            {formatNumber(project.dataset_rows)} rows · {allBranches.length}{" "}
            {allBranches.length === 1 ? "branch" : "branches"}
          </>
        }
        action={
          isMember ? (
            <ButtonLink href={`/projects/${projectId}/dashboard`} variant="secondary">
              Open dashboard
            </ButtonLink>
          ) : undefined
        }
      />

      {isOwner && (
        <nav className="mt-6 flex gap-1 border-b border-border-subtle" aria-label="Team sections">
          <TabLink projectId={projectId} tab="people" active={tab === "people"}>
            People &amp; branches
          </TabLink>
          <TabLink projectId={projectId} tab="agent" active={tab === "agent"}>
            Agent access
          </TabLink>
        </nav>
      )}

      {tab === "agent" ? (
        <div className="mt-6">
          <AgentAccess repoRoot={process.cwd()} />
        </div>
      ) : isOwner ? (
        <OwnerView
          projectId={projectId}
          project={project}
          branches={branches}
          ownerId={user.id}
        />
      ) : isMember ? (
        <ManagerView projectId={projectId} userId={user.id} branches={branches} />
      ) : (
        <OutsiderView
          projectId={projectId}
          userId={user.id}
          role={user.role}
          allBranches={allBranches}
        />
      )}
    </main>
  );
}

/**
 * A tab. A link, not a button — the section is in the URL, so it survives a
 * reload and can be linked to directly.
 */
function TabLink({
  projectId,
  tab,
  active,
  children,
}: {
  projectId: string;
  tab: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/projects/${projectId}/team?tab=${tab}`}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-body-sm font-semibold transition-colors duration-(--duration-fast) ${
        active
          ? "border-brand-blue text-brand-deep"
          : "border-transparent text-ink-secondary hover:text-brand-deep"
      }`}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- owner */

type Branches = Awaited<ReturnType<typeof projectAccessFor>>["branches"];
type Project = Awaited<ReturnType<typeof projectAccessFor>>["project"];

function OwnerView({
  projectId,
  project,
  branches,
  ownerId,
}: {
  projectId: string;
  project: Project;
  branches: Branches;
  ownerId: string;
}) {
  const pending = listRequests(projectId, "pending");
  const companyToken = getCompanyToken(ownerId);
  const companyMembers = listCompanyMembers(ownerId);
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
          title="Company token"
          description="One token for your whole company. A manager uses it to create their own account — no payment, and no branch until you approve one."
        >
          <CompanyToken
            token={companyToken?.token ?? null}
            expiresAt={companyToken?.expires_at ?? null}
            uses={companyToken?.uses ?? 0}
            expired={companyToken?.expired ?? false}
            members={companyMembers.length}
          />
        </Panel>

        <Panel
          title="Project link"
          description="Send this to a branch manager. They see the branch list and ask for the ones they run — it grants nothing on its own."
        >
          <CopyLink token={project.invite_token} projectId={projectId} />
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

/* ---------------------------------------------------------------- outsider */

/**
 * Someone who holds nothing here yet.
 *
 * They get the branch list and a form. Not the dashboard link, not the invite
 * link, not the manager roster, and not a single number from the data — which
 * is the whole reason this view exists separately rather than reusing the
 * manager one with things hidden.
 */
function OutsiderView({
  projectId,
  userId,
  role,
  allBranches,
}: {
  projectId: string;
  userId: string;
  role: string;
  allBranches: Branches;
}) {
  const pending = new Set(
    listRequestsByUser(userId, projectId)
      .filter((request) => request.status === "pending")
      .map((request) => request.branch_id)
  );
  const declined = listRequestsByUser(userId, projectId).filter(
    (request) => request.status === "rejected"
  );

  return (
    <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <Panel
        title="Branches in this project"
        description={
          role === "owner"
            ? "You are signed in as an owner of your own workspace."
            : "Select the ones you manage. The owner reviews every request before anything is shared."
        }
      >
        {role === "owner" ? (
          // Requesting is a manager action, and `requestBranchAccess` refuses an
          // owner account. Showing the form anyway would be a button that always
          // fails, so say why instead.
          <>
            <ul className="divide-y divide-border-subtle">
              {allBranches.map((branch) => (
                <li key={branch.id} className="py-2.5 first:pt-0">
                  <p className="text-body-sm font-semibold text-ink">{branch.location}</p>
                  <p className="text-meta text-ink-tertiary">
                    {branch.code} · {formatNumber(branch.product_count)} products
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-5 flex items-start gap-2 border-t border-border-subtle pt-4 text-body-sm text-ink-secondary">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-watch" />
              Owner accounts cannot request branches. Ask this project&rsquo;s owner to add
              your manager account instead.
            </p>
          </>
        ) : (
          <RequestAccess
            projectId={projectId}
            branches={allBranches}
            grantedIds={[]}
            pendingIds={[...pending]}
          />
        )}
      </Panel>

      <div className="space-y-5">
        <Panel title="What the owner sees">
          <p className="text-body-sm leading-relaxed text-ink-secondary">
            Your name, your email, the branches you asked for and your note. They approve or
            decline each branch, and approval takes effect on your next page load.
          </p>
        </Panel>

        {declined.length > 0 && (
          <Panel title="Previously declined">
            <ul className="space-y-2.5">
              {declined.map((request) => (
                <li key={request.id} className="flex items-start gap-2.5">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-critical" />
                  <div>
                    <p className="text-body-sm font-medium text-ink">
                      {request.branch_code} · {request.branch_location}
                    </p>
                    <p className="text-meta text-ink-tertiary">
                      Asking again reopens it rather than adding a second request.
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
          <Shield size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
          <p className="text-body-sm leading-relaxed text-ink-secondary">
            You can see the branch names here, and nothing else. No forecasts, no order
            lists and no rows until a branch is approved for you.
          </p>
        </div>
      </div>
    </div>
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
