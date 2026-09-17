"use server";

/**
 * Every write the auth layer accepts.
 *
 * Server Actions are reachable by direct POST, so each one re-checks who is
 * calling and what they are entitled to touch. None of them trusts an id that
 * arrived in the form: a project id is resolved through `requireOwner`, an
 * upload through the caller's own user id, a branch through the project it
 * belongs to.
 */
import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticate,
  createProject,
  createUser,
  decideRequest as decideRequestInDb,
  findUserByEmail,
  getBranch,
  getProject,
  getRequest,
  getUpload,
  grantAccess,
  listBranches,
  requestAccess,
  revokeAccess,
} from "./db";
import { readUpload, splitByBranch } from "./dataset";
import { endSession, requireOwner, requireSession, startSession } from "./session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/* ---------------------------------------------------------------- sign in */

export type SignInState = { error: string | null };

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const user = authenticate(email, password);
  // One message for both a wrong address and a wrong password, so the form
  // never confirms which addresses exist.
  if (!user) return { error: "Email or password is not recognised." };

  await startSession(user.id);
  redirect("/projects");
}

export async function signOut() {
  await endSession();
  redirect("/");
}

/* ------------------------------------------- confirm columns, split branches */

export type ConfirmState = { error: string | null };

/**
 * The answer to the review screen's questions, and the only place a project is
 * created.
 *
 * The split runs on confirmation rather than on upload because until the owner
 * has said which column is the branch, every branch we could produce would be
 * a guess presented as a fact.
 */
export async function confirmColumns(
  _previous: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const user = await requireSession();
  if (user.role !== "owner") return { error: "Only a project owner can create a project." };

  const upload = getUpload(field(formData, "upload_id"), user.id);
  if (!upload) return { error: "That upload is no longer available. Upload the file again." };

  const columns = {
    branchId: field(formData, "branch_id_column"),
    branchLocation: field(formData, "branch_location_column"),
    product: field(formData, "product_column"),
  };
  for (const [key, value] of Object.entries(columns)) {
    if (!upload.columns.includes(value)) {
      return { error: `Answer the question about the ${key} column before continuing.` };
    }
  }
  if (columns.branchId === columns.branchLocation) {
    return { error: "The branch ID and branch location cannot be the same column." };
  }

  const name = field(formData, "name") || upload.filename.replace(/\.[^.]+$/, "");

  let branches;
  try {
    branches = splitByBranch(readUpload(upload.stored_path), columns);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That file could not be split." };
  }
  if (branches.length === 0) {
    return { error: "No branches were found in that column. Pick a different one." };
  }

  const project = createProject({
    ownerId: user.id,
    name,
    organisation: user.organisation,
    datasetFilename: upload.filename,
    datasetRows: upload.row_count,
    branchIdColumn: columns.branchId,
    branchLocationColumn: columns.branchLocation,
    productColumn: columns.product,
    // Every branch of this upload claims the one dataset the forecasting
    // service made from it. That is honest about what the backend can do today:
    // it holds the whole file as one dataset and cannot split a forecast per
    // branch. Gap B11 is the per-branch scoping that would change it.
    branches: branches.map((branch) => ({
      ...branch,
      forecastProjectId: upload.dataset_id,
    })),
  });

  // Straight into the canonical mapping review when the forecasting service
  // took the file; otherwise to the team screen, which is all there is.
  redirect(
    upload.dataset_id
      ? `/projects/${upload.dataset_id}/review`
      : `/projects/${project.project_id}/team`,
  );
}

/* ---------------------------------------------------------------- managers */

export type InviteState = {
  error: string | null;
  /** Shown once, because there is no mail server to send it through. */
  invited: { email: string; password: string | null; branches: number } | null;
};

/**
 * Registers a manager against one or more branches.
 *
 * An address that already belongs to someone is granted the branches rather
 * than refused, so an owner adding a second branch to an existing manager does
 * not have to know whether that person has an account yet. A new account gets a
 * generated password, returned once for the owner to pass on.
 */
export async function inviteManager(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { user: owner, project } = await requireOwner(field(formData, "project_id"));

  const email = field(formData, "email").toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address.", invited: null };

  // Branch ids are checked against this project, so a stray id from another
  // project cannot be granted through this form.
  const projectBranchIds = new Set(listBranches(project.project_id).map((b) => b.id));
  const branchIds = formData
    .getAll("branch_ids")
    .map(String)
    .filter((id) => projectBranchIds.has(id));
  if (branchIds.length === 0) {
    return { error: "Select at least one branch for this manager.", invited: null };
  }

  const existing = findUserByEmail(email);
  if (existing && existing.role === "owner") {
    return { error: "That address belongs to an owner and cannot be a manager.", invited: null };
  }

  let password: string | null = null;
  let manager = existing;
  if (!manager) {
    password = randomBytes(6).toString("base64url");
    manager = createUser({
      email,
      name: field(formData, "name") || email.split("@")[0],
      organisation: project.organisation,
      role: "manager",
      password,
    });
  }

  for (const branchId of branchIds) grantAccess(manager.id, branchId, owner.id);

  refresh();
  return { error: null, invited: { email, password, branches: branchIds.length } };
}

export async function revokeBranch(formData: FormData) {
  const { project } = await requireOwner(field(formData, "project_id"));
  const branch = getBranch(field(formData, "branch_id"));
  if (!branch || branch.project_id !== project.project_id) return;

  revokeAccess(field(formData, "user_id"), branch.id);
  refresh();
}

/* ---------------------------------------------------------- access requests */

export type RequestState = { error: string | null; submitted: number };

/**
 * A manager asking for the branches they run, from the project link the owner
 * gave them. The link proves nothing on its own — it identifies the project,
 * and the owner still decides.
 */
export async function requestBranchAccess(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const user = await requireSession();
  const project = getProject(field(formData, "project_id"));
  if (!project) return { error: "That project link is no longer valid.", submitted: 0 };
  if (user.role === "owner") {
    return { error: "You are signed in as an owner, not a manager.", submitted: 0 };
  }

  const projectBranchIds = new Set(listBranches(project.project_id).map((b) => b.id));
  const branchIds = formData
    .getAll("branch_ids")
    .map(String)
    .filter((id) => projectBranchIds.has(id));
  if (branchIds.length === 0) {
    return { error: "Select the branches you manage.", submitted: 0 };
  }

  const note = field(formData, "note") || null;
  for (const branchId of branchIds) {
    requestAccess({ userId: user.id, projectId: project.project_id, branchId, note });
  }

  refresh();
  return { error: null, submitted: branchIds.length };
}

/** The owner's approve/reject. Approving grants the branch; see `db.ts`. */
export async function decideRequest(formData: FormData) {
  const { user: owner, project } = await requireOwner(field(formData, "project_id"));
  const request = getRequest(field(formData, "request_id"));
  if (!request || request.project_id !== project.project_id) return;

  const decision = field(formData, "decision");
  if (decision !== "approved" && decision !== "rejected") return;

  decideRequestInDb(request.id, decision, owner.id);
  refresh();
}
