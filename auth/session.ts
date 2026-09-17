/**
 * Session and authorisation.
 *
 * The cookie is stateless and signed: `payload.signature`, where the payload
 * carries only a user id and an expiry. It is HMAC-SHA256 with a key that
 * never leaves the server, so a tampered cookie is rejected rather than
 * believed — which is the difference between this and the base64 stand-in it
 * replaces.
 *
 * Everything the app renders comes from `getSession()`, which re-reads the user
 * from the database on every request. The cookie asserts identity; the database
 * decides what that identity may do. A role or a grant changed by the owner
 * therefore takes effect on the manager's next request, not on their next
 * sign-in.
 */
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { timingSafeEqual } from "node:crypto";
import {
  accessibleLocations,
  findBranchByForecastProject,
  uploaderOf,
  getProject,
  getUser,
  hasBranchAccess,
  listAccessibleBranches,
  listBranches,
  sign,
  type AuthUser,
  type Branch,
  type Project,
} from "./db";

export const SESSION_COOKIE = "hkt_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function encode(userId: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: expiresAt })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid?: string;
      exp?: number;
    };
    if (!uid || !exp || exp < Date.now()) return null;
    return uid;
  } catch {
    return null;
  }
}

export async function startSession(userId: string): Promise<void> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  (await cookies()).set(SESSION_COOKIE, encode(userId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The signed-in user, or null.
 *
 * `cache` keeps it to one database read per request no matter how many
 * components ask.
 */
export const getSession = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = decode(token);
  return userId ? getUser(userId) : null;
});

/** For anything that only exists for a signed-in user. */
export async function requireSession(): Promise<AuthUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/**
 * A project any signed-in person may look at, and what they may do with it.
 *
 * Deliberately softer than `requireProjectAccess`: a manager who holds nothing
 * in this project still gets here, because the project id IS the shareable
 * link — that is how someone finds the branches they run and asks for them.
 * Refusing them would mean every request has to start with the owner sending a
 * secret token, which is a worse product and not actually more secure: the
 * invite link already hands out the same information.
 *
 * What an outsider gets is the branch LIST — names and sizes — and nothing
 * else. No forecasts, no recommendations, no rows. Those still go through
 * `requireForecastAccess`, and the team screen renders a request form rather
 * than the owner's management surface.
 *
 * Project ids are 12 random hex characters, so this is not an enumerable
 * directory of every company on the service.
 */
export async function projectAccessFor(projectId: string): Promise<{
  user: AuthUser;
  project: Project;
  /** Branches this person holds. Empty for an outsider. */
  branches: Branch[];
  /** Every branch in the project — the list an outsider may request from. */
  allBranches: Branch[];
  isOwner: boolean;
  /** True when they already hold at least one branch here. */
  isMember: boolean;
}> {
  const user = await requireSession();
  const project = getProject(projectId);
  if (!project) notFound();

  const allBranches = listBranches(project.project_id);
  if (project.owner_id === user.id) {
    return { user, project, branches: allBranches, allBranches, isOwner: true, isMember: true };
  }

  const branches = listAccessibleBranches(user.id, project.project_id);
  return {
    user,
    project,
    branches,
    allBranches,
    isOwner: false,
    isMember: branches.length > 0,
  };
}

/**
 * A project the caller is entitled to open, with the branches they may work on.
 *
 * Owners get their own projects and every branch in them. Managers get the
 * branches they have been granted and nothing else — an approved branch is the
 * unit of access, so a manager on one branch of a project cannot read another.
 *
 * Repeated in every action and page that touches project data rather than
 * assumed from a layout, because a Server Action is reachable by direct POST.
 *
 * Refusal is a 404, not a 403: telling someone a project exists but is not
 * theirs is already more than they are entitled to know.
 */
export async function requireProjectAccess(projectId: string): Promise<{
  user: AuthUser;
  project: Project;
  branches: Branch[];
  isOwner: boolean;
}> {
  const user = await requireSession();
  const project = getProject(projectId);
  if (!project) notFound();

  if (project.owner_id === user.id) {
    return { user, project, branches: listBranches(project.project_id), isOwner: true };
  }

  const branches = listAccessibleBranches(user.id, project.project_id);
  if (branches.length === 0) notFound();
  return { user, project, branches, isOwner: false };
}

/**
 * Guards a forecasting project — a dashboard, its review screen, its data
 * update — by the branch that claims it.
 *
 * The forecasting service has its own id space and knows nothing about branches
 * or access. This is the join between the two: if some branch has staked a
 * claim on that project, only that branch's people may open it.
 *
 * **Default deny.** This used to let any signed-in user open a project no
 * branch claimed, reasoning that a dataset pushed straight into the forecasting
 * service was not this layer's to govern. It failed open: abandoned uploads —
 * real rows, real quantities, every branch — were readable by every account.
 *
 * An unclaimed dataset now belongs to whoever uploaded it through this app,
 * which covers the window between uploading a file and answering the column
 * questions. A dataset this layer has never seen belongs to nobody and is
 * refused, because a 404 is the right answer to "is this mine?" when we have no
 * reason to think it is.
 */
export async function requireForecastAccess(forecastProjectId: string): Promise<AuthUser> {
  const user = await requireSession();
  const branch = findBranchByForecastProject(forecastProjectId);

  if (!branch) {
    if (uploaderOf(forecastProjectId) !== user.id) notFound();
    return user;
  }

  const project = getProject(branch.project_id);
  if (project?.owner_id === user.id) return user;
  if (!hasBranchAccess(user.id, branch.id)) notFound();
  return user;
}

/**
 * Does this person own the project a forecasting dataset belongs to?
 *
 * Non-throwing, because the caller is usually a page deciding whether to
 * render an owner-only section. A manager opening the dashboard should find
 * the section absent, not find the whole page gone — hiding is the right
 * failure here, and `requireForecastOwner` below is what actually refuses.
 *
 * An unclaimed dataset answers true only for whoever uploaded it, which mirrors
 * the default-deny rule in `requireForecastAccess`. An earlier version of this
 * returned true for any signed-in user on an unclaimed dataset, reasoning that
 * they could already read all of it anyway. That reasoning stopped being true
 * the moment `requireForecastAccess` closed that hole, and this function is
 * reachable from a Server Action without the page — so it must never be more
 * permissive than the read check guarding the same data.
 */
export async function isForecastOwner(forecastProjectId: string): Promise<boolean> {
  const user = await getSession();
  if (!user) return false;

  const branch = findBranchByForecastProject(forecastProjectId);
  if (!branch) return uploaderOf(forecastProjectId) === user.id;

  return getProject(branch.project_id)?.owner_id === user.id;
}

/**
 * The owner of the project a forecasting dataset belongs to, or a 404.
 *
 * For the capabilities a branch manager must not have even by direct POST —
 * scenario simulation is one, because it is a whole-network planning tool and
 * a manager is scoped to one branch. A Server Action is reachable without the
 * page that renders it, so hiding the UI is not the control; this is.
 */
export async function requireForecastOwner(forecastProjectId: string): Promise<AuthUser> {
  const user = await requireSession();
  if (!(await isForecastOwner(forecastProjectId))) notFound();
  return user;
}

export interface BranchScope {
  /**
   * The branch this request is scoped to, or null for the whole network.
   *
   * Null is only ever returned to someone entitled to everything. A restricted
   * user always gets a concrete branch — there is no path where "I hold some
   * branches" becomes "show me all of them".
   */
  location: string | null;
  /** Every location this user may see, or null for unrestricted. */
  locations: string[] | null;
  /** Branches to offer in the picker. Empty when there is nothing to choose. */
  options: string[];
  /** True when this user cannot see the whole network. */
  restricted: boolean;
}

/** A code that matches nothing, so a bad scope returns no rows rather than all. */
const NO_BRANCH = "__none__";

/**
 * Which branch a dashboard request is scoped to.
 *
 * The forecasting service takes one `?location=` per call. A manager holding
 * several branches therefore has to look at one at a time, and `requested` is
 * which — it comes from the URL, so it is untrusted and checked against what
 * they actually hold.
 *
 * The rule that matters: **a restricted user never gets an unscoped request.**
 * An earlier version returned null for a multi-branch manager and showed a note
 * explaining why the whole network was on screen. A note beside leaked data is
 * not a control: their overview carried every branch's KPIs and the owner's
 * exact totals. Now an unrecognised or unauthorised `requested` falls back to
 * the first branch they hold, and holding none scopes to a code that matches
 * nothing.
 */
export async function branchScope(
  forecastProjectId: string,
  requested?: string | null,
): Promise<BranchScope> {
  const user = await requireSession();
  const locations = accessibleLocations(user.id, forecastProjectId);

  // Unrestricted: the whole network by default, one branch if they asked for
  // one. An owner focusing a single branch is a feature, not a restriction.
  if (locations === null) {
    return {
      location: requested || null,
      locations: null,
      options: [],
      restricted: false,
    };
  }

  if (locations.length === 0) {
    return { location: NO_BRANCH, locations, options: [], restricted: true };
  }

  // Untrusted input: only a branch they hold is honoured. Anything else — a
  // typo, another branch's code, a revoked grant — falls back rather than
  // widening.
  const location =
    requested && locations.includes(requested) ? requested : locations[0];

  return {
    location,
    locations,
    options: locations.length > 1 ? locations : [],
    restricted: true,
  };
}

/** For the owner-only surfaces: inviting managers, deciding requests. */
export async function requireOwner(projectId: string): Promise<{
  user: AuthUser;
  project: Project;
}> {
  const user = await requireSession();
  const project = getProject(projectId);
  if (!project || project.owner_id !== user.id) notFound();
  return { user, project };
}
