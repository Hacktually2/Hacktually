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
  findBranchByForecastProject,
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
 * A project no branch claims is left alone. That is on purpose: a dataset
 * pushed straight into forecasting is not governed by this layer, and refusing
 * it here would mean the auth service silently owns things it was never told
 * about. Signed-in is the floor; the layout above already enforces that.
 */
export async function requireForecastAccess(forecastProjectId: string): Promise<AuthUser> {
  const user = await requireSession();
  const branch = findBranchByForecastProject(forecastProjectId);
  if (!branch) return user;

  const project = getProject(branch.project_id);
  if (project?.owner_id === user.id) return user;
  if (!hasBranchAccess(user.id, branch.id)) notFound();
  return user;
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
