/**
 * Auth store — who may look at what.
 *
 * Deliberately separate from the forecasting backend in `backend/`: different
 * process, different database file, different schema. That service owns
 * datasets, models and recommendations; this one owns identity, projects,
 * branches and access. Nothing here imports from `backend/`, and nothing there
 * needs to know this exists. The only shared artefact is the CSV the owner
 * uploads.
 *
 * SQLite via `node:sqlite`, a Node builtin, so the whole auth layer costs the
 * app zero new dependencies. Importing this module from a Client Component
 * fails the build, which is the boundary we want: it is server-only by
 * construction rather than by convention.
 */
import {
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/* ------------------------------------------------------------------- types */

export type Role = "owner" | "manager";
export type RequestStatus = "pending" | "approved" | "rejected";

/**
 * Everything a page is allowed to know about the signed-in person.
 *
 * Structurally compatible with the `Session` the app shell already renders, so
 * the workspace header, account menu and settings panel keep working unchanged.
 * No password material ever leaves this module.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organisation: string;
  role: Role;
  initials: string;
  /** The owner whose company this manager joined, if they joined via a token. */
  company_of: string | null;
}

export interface Project {
  project_id: string;
  name: string;
  organisation: string;
  owner_id: string;
  /** The unguessable link an owner hands a manager. */
  invite_token: string;
  dataset_filename: string;
  dataset_rows: number;
  branch_id_column: string;
  branch_location_column: string;
  product_column: string;
  created_at: string;
}

export interface Branch {
  id: string;
  project_id: string;
  code: string;
  location: string;
  product_count: number;
  row_count: number;
  /**
   * The project this branch's data lives in inside the forecasting service.
   *
   * A foreign key into the other backend, and the only thing this layer knows
   * about it: given a branch, which dashboard does it open. Null for a branch
   * split out of a CSV that has not been handed to forecasting yet.
   */
  forecast_project_id: string | null;
}

export interface AccessRequest {
  id: string;
  project_id: string;
  branch_id: string;
  branch_code: string;
  branch_location: string;
  user_id: string;
  user_name: string;
  user_email: string;
  note: string | null;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
}

export interface Membership {
  user_id: string;
  name: string;
  email: string;
  branches: Branch[];
  pending: number;
}

export interface Upload {
  id: string;
  owner_id: string;
  filename: string;
  stored_path: string;
  columns: string[];
  samples: Record<string, string[]>;
  row_count: number;
  /**
   * The dataset the forecasting service created from this same file, if the
   * ingest succeeded. Null when the service was down: the branch split still
   * works, the branches just have no dashboard behind them yet.
   */
  dataset_id: string | null;
}

/* ---------------------------------------------------------------- database */

/**
 * Reads a flag from the environment, falling back to `.env` on disk.
 *
 * Next loads `.env` for us; a plain `node script.ts` does not. That gap is not
 * academic — it is how the demo accounts came back after a deliberate wipe: a
 * maintenance script imported this module, `AUTH_SKIP_SEED` was unset in that
 * process, and `seed()` helpfully recreated three accounts with published
 * passwords. A flag that only holds in one of two entry points is not a flag.
 */
function envFlag(name: string): string | undefined {
  if (process.env[name] !== undefined) return process.env[name];
  try {
    for (const line of readFileSync(path.join(process.cwd(), ".env"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key.trim() === name) return rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env is the normal case */
  }
  return undefined;
}

const DATA_DIR = process.env.AUTH_DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads", "auth");

mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "auth.db"));
// FIRST, before anything that takes a lock. `next build` collects pages in
// parallel workers and `next dev` may hold the file at the same time; switching
// the journal mode itself needs a brief exclusive lock, so a busy timeout set
// after it is already too late and the loser of that race dies with
// SQLITE_BUSY ("database is locked") instead of waiting a few milliseconds.
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  organisation  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  organisation           TEXT NOT NULL,
  owner_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token           TEXT NOT NULL UNIQUE,
  dataset_filename       TEXT NOT NULL,
  dataset_rows           INTEGER NOT NULL,
  branch_id_column       TEXT NOT NULL,
  branch_location_column TEXT NOT NULL,
  product_column         TEXT NOT NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  location            TEXT NOT NULL,
  product_count       INTEGER NOT NULL,
  row_count           INTEGER NOT NULL,
  forecast_project_id TEXT,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS branch_access (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id  TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL REFERENCES users(id),
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, branch_id)
);

-- One row per (manager, branch): a re-request after a rejection updates the
-- existing row rather than piling up history the owner has to read through.
CREATE TABLE IF NOT EXISTS access_requests (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id  TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT REFERENCES users(id),
  UNIQUE (user_id, branch_id)
);

-- One live join token per owner. Regenerating replaces the row, which is how
-- rotation works: the previous token stops resolving the moment a new one is
-- written, with no separate revocation list to keep in step.
CREATE TABLE IF NOT EXISTS company_tokens (
  owner_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  uses       INTEGER NOT NULL DEFAULT 0
);

-- A file that has been received but not yet interpreted. It becomes a project
-- only once the owner has answered the column questions.
CREATE TABLE IF NOT EXISTS uploads (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  columns     TEXT NOT NULL,
  samples     TEXT NOT NULL,
  row_count   INTEGER NOT NULL,
  dataset_id  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// The demo database is disposable, but crashing on someone's existing copy is
// a worse first impression than four lines of migration.
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existing.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("branches", "forecast_project_id", "TEXT");
// Which owner's company a manager joined. Null for owners and for the seeded
// demo managers, who predate company tokens.
addColumnIfMissing("users", "company_of", "TEXT");
addColumnIfMissing("uploads", "dataset_id", "TEXT");

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const num = (row: Row, key: string) => Number(row[key]);

/* --------------------------------------------------------------- passwords */

// 16 MiB of work per hash (128 * N * r), which is inside Node's default
// maxmem and slow enough that a stolen database is not a password list.
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------ cookie signing */

let cachedSecret: Buffer | null = null;

/**
 * The key session cookies are signed with.
 *
 * `AUTH_SECRET` wins when set. Without it one is generated on first run and
 * kept in the database, so sessions survive a restart without a secret ever
 * being committed to the repository or a shared default shipping in source.
 */
export function sessionSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return (cachedSecret = Buffer.from(fromEnv, "utf8"));

  const row = db.prepare("SELECT value FROM meta WHERE key = 'session_secret'").get() as
    | Row
    | undefined;
  if (row) return (cachedSecret = Buffer.from(text(row, "value"), "hex"));

  const generated = randomBytes(32);
  db.prepare("INSERT INTO meta (key, value) VALUES ('session_secret', ?)").run(
    generated.toString("hex"),
  );
  return (cachedSecret = generated);
}

export function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/* ------------------------------------------------------------------- users */

/** "Sari Wijaya" -> "SW". The avatar wants two letters, not a whole name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function toUser(row: Row): AuthUser {
  return {
    id: text(row, "id"),
    email: text(row, "email"),
    name: text(row, "name"),
    organisation: text(row, "organisation"),
    role: text(row, "role") as Role,
    initials: initialsOf(text(row, "name")),
    company_of: row.company_of == null ? null : text(row, "company_of"),
  };
}

export function getUser(id: string): AuthUser | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
  return row ? toUser(row) : null;
}

export function findUserByEmail(email: string): AuthUser | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as
    | Row
    | undefined;
  return row ? toUser(row) : null;
}

/**
 * Checks a password and returns the user, or null.
 *
 * Both failure modes return null from the same call so the caller cannot
 * accidentally tell the visitor which one it was.
 */
export function authenticate(email: string, password: string): AuthUser | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim()) as
    | Row
    | undefined;
  if (!row) {
    // Spend the same work on an unknown address as on a known one, so response
    // time does not reveal which accounts exist.
    verifyPassword(password, hashPassword("timing-equaliser"));
    return null;
  }
  return verifyPassword(password, text(row, "password_hash")) ? toUser(row) : null;
}

export function createUser(input: {
  email: string;
  name: string;
  organisation: string;
  role: Role;
  password: string;
  /** Set when a manager joined through an owner's company token. */
  companyOf?: string | null;
}): AuthUser {
  const id = `usr_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  db.prepare(
    `INSERT INTO users (id, email, name, organisation, role, password_hash, company_of)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.email.trim(),
    input.name.trim(),
    input.organisation.trim(),
    input.role,
    hashPassword(input.password),
    input.companyOf ?? null,
  );
  return getUser(id)!;
}

/* ---------------------------------------------------------- company tokens */

export interface CompanyToken {
  token: string;
  expires_at: string;
  uses: number;
  expired: boolean;
}

/** Two weeks: long enough to onboard a team, short enough to stop rotting. */
const COMPANY_TOKEN_DAYS = 14;

/**
 * Issues an owner's company token, replacing any previous one.
 *
 * This token lets a stranger create a **manager** account inside the owner's
 * company without paying, so it is the most dangerous string this app produces.
 * Four things keep it from being a standing backdoor:
 *
 *   1. 256 bits of randomness — not guessable, not enumerable.
 *   2. It expires. A token forgotten in a WhatsApp thread stops working.
 *   3. Regenerating REPLACES it, because the row is keyed by owner. That is
 *      revocation: there is no second list to forget to update.
 *   4. It grants company membership and nothing else — no branch, no data. The
 *      owner still approves every branch individually.
 *
 * It cannot mint an owner, so it can never be used to buy nothing and get the
 * role that decides who sees what.
 */
export function issueCompanyToken(ownerId: string): CompanyToken {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO company_tokens (owner_id, token, created_at, expires_at, uses)
     VALUES (?, ?, datetime('now'), datetime('now', ?), 0)
     ON CONFLICT (owner_id) DO UPDATE SET
       token      = excluded.token,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       uses       = 0`,
  ).run(ownerId, token, `+${COMPANY_TOKEN_DAYS} days`);
  return getCompanyToken(ownerId)!;
}

export function getCompanyToken(ownerId: string): CompanyToken | null {
  const row = db
    .prepare(
      `SELECT token, expires_at, uses, expires_at < datetime('now') AS expired
       FROM company_tokens WHERE owner_id = ?`,
    )
    .get(ownerId) as Row | undefined;
  if (!row) return null;
  return {
    token: text(row, "token"),
    expires_at: text(row, "expires_at"),
    uses: num(row, "uses"),
    expired: num(row, "expired") === 1,
  };
}

export function revokeCompanyToken(ownerId: string): void {
  db.prepare("DELETE FROM company_tokens WHERE owner_id = ?").run(ownerId);
}

/**
 * The owner a company token belongs to, or null.
 *
 * Expiry is checked in SQL rather than after the fetch, so an expired token is
 * indistinguishable from a wrong one — the caller cannot learn that a token was
 * once valid.
 */
export function ownerOfCompanyToken(token: string): AuthUser | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT owner_id FROM company_tokens
       WHERE token = ? AND expires_at > datetime('now')`,
    )
    .get(token) as Row | undefined;
  if (!row) return null;

  const owner = getUser(text(row, "owner_id"));
  // A token whose owner is no longer an owner is not a way in.
  return owner && owner.role === "owner" ? owner : null;
}

export function countCompanyTokenUse(token: string): void {
  db.prepare("UPDATE company_tokens SET uses = uses + 1 WHERE token = ?").run(token);
}

/** Managers who joined this owner's company, newest first. */
export function listCompanyMembers(ownerId: string): AuthUser[] {
  return (
    db
      .prepare("SELECT * FROM users WHERE company_of = ? ORDER BY created_at DESC")
      .all(ownerId) as Row[]
  ).map(toUser);
}

/* ----------------------------------------------------------------- uploads */

export function createUpload(input: {
  ownerId: string;
  filename: string;
  storedPath: string;
  columns: string[];
  samples: Record<string, string[]>;
  rowCount: number;
}): string {
  const id = `upl_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  db.prepare(
    `INSERT INTO uploads (id, owner_id, filename, stored_path, columns, samples, row_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.ownerId,
    input.filename,
    input.storedPath,
    JSON.stringify(input.columns),
    JSON.stringify(input.samples),
    input.rowCount,
  );
  return id;
}

/** Scoped by owner: an upload id from someone else's session is a miss. */
export function getUpload(id: string, ownerId: string): Upload | null {
  const row = db.prepare("SELECT * FROM uploads WHERE id = ? AND owner_id = ?").get(
    id,
    ownerId,
  ) as Row | undefined;
  if (!row) return null;
  return {
    id: text(row, "id"),
    owner_id: text(row, "owner_id"),
    filename: text(row, "filename"),
    stored_path: text(row, "stored_path"),
    columns: JSON.parse(text(row, "columns")) as string[],
    samples: JSON.parse(text(row, "samples")) as Record<string, string[]>,
    row_count: num(row, "row_count"),
    dataset_id: row.dataset_id == null ? null : text(row, "dataset_id"),
  };
}

/**
 * Records which forecasting dataset this upload became.
 *
 * Separate from `createUpload` because the two happen against different
 * services, and the branch split must survive the forecasting one being down.
 */
export function setUploadDataset(uploadId: string, datasetId: string): void {
  db.prepare("UPDATE uploads SET dataset_id = ? WHERE id = ?").run(datasetId, uploadId);
}

/* ---------------------------------------------------------------- projects */

function toProject(row: Row): Project {
  return {
    project_id: text(row, "id"),
    name: text(row, "name"),
    organisation: text(row, "organisation"),
    owner_id: text(row, "owner_id"),
    invite_token: text(row, "invite_token"),
    dataset_filename: text(row, "dataset_filename"),
    dataset_rows: num(row, "dataset_rows"),
    branch_id_column: text(row, "branch_id_column"),
    branch_location_column: text(row, "branch_location_column"),
    product_column: text(row, "product_column"),
    created_at: text(row, "created_at"),
  };
}

/**
 * Creates the project and its branches in one transaction.
 *
 * A project with no branches would be a project nobody can be given access to,
 * so the two writes are one unit: either the whole split lands or none of it.
 */
export function createProject(input: {
  ownerId: string;
  name: string;
  organisation: string;
  datasetFilename: string;
  datasetRows: number;
  branchIdColumn: string;
  branchLocationColumn: string;
  productColumn: string;
  branches: {
    code: string;
    location: string;
    productCount: number;
    rowCount: number;
    forecastProjectId?: string | null;
  }[];
}): Project {
  const id = `prj_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const token = randomBytes(18).toString("base64url");

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO projects (id, name, organisation, owner_id, invite_token,
                             dataset_filename, dataset_rows,
                             branch_id_column, branch_location_column, product_column)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.organisation,
      input.ownerId,
      token,
      input.datasetFilename,
      input.datasetRows,
      input.branchIdColumn,
      input.branchLocationColumn,
      input.productColumn,
    );

    const insertBranch = db.prepare(
      `INSERT INTO branches (id, project_id, code, location, product_count, row_count,
                             forecast_project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const branch of input.branches) {
      insertBranch.run(
        `brc_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        id,
        branch.code,
        branch.location,
        branch.productCount,
        branch.rowCount,
        branch.forecastProjectId ?? null,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
  return row ? toProject(row) : null;
}

export function getProjectByToken(token: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE invite_token = ?").get(token) as
    | Row
    | undefined;
  return row ? toProject(row) : null;
}

/**
 * What this person can see in the project chooser.
 *
 * An owner sees what they own. A manager sees a project the moment they are
 * involved in it — granted a branch or waiting on a decision — so a request
 * that has not been answered yet does not simply vanish from their workspace.
 */
export function listProjectsForUser(user: AuthUser): Project[] {
  const sql =
    user.role === "owner"
      ? `SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC`
      : // A manager sees a project when they hold a branch in it, when they are
        // waiting on one, or when it belongs to the company they joined — that
        // last one is the point of joining: it is how they find the branches to
        // ask for. Seeing the project NAME is not seeing its data; every row
        // still goes through requireForecastAccess.
        `SELECT DISTINCT p.* FROM projects p
         LEFT JOIN branches b        ON b.project_id = p.id
         LEFT JOIN branch_access a   ON a.branch_id = b.id AND a.user_id = ?1
         LEFT JOIN access_requests r ON r.branch_id = b.id AND r.user_id = ?1
         WHERE a.user_id IS NOT NULL
            OR r.user_id IS NOT NULL
            OR p.owner_id = (SELECT company_of FROM users WHERE id = ?1)
         ORDER BY p.created_at DESC`;
  return (db.prepare(sql).all(user.id) as Row[]).map(toProject);
}

/* ---------------------------------------------------------------- branches */

function toBranch(row: Row): Branch {
  return {
    id: text(row, "id"),
    project_id: text(row, "project_id"),
    code: text(row, "code"),
    location: text(row, "location"),
    product_count: num(row, "product_count"),
    row_count: num(row, "row_count"),
    forecast_project_id:
      row.forecast_project_id == null ? null : text(row, "forecast_project_id"),
  };
}

export function listBranches(projectId: string): Branch[] {
  return (
    db
      .prepare("SELECT * FROM branches WHERE project_id = ? ORDER BY code")
      .all(projectId) as Row[]
  ).map(toBranch);
}

export function getBranch(id: string): Branch | null {
  const row = db.prepare("SELECT * FROM branches WHERE id = ?").get(id) as Row | undefined;
  return row ? toBranch(row) : null;
}

/** The branches this user may actually work on. Empty for a manager with none. */
export function listAccessibleBranches(userId: string, projectId: string): Branch[] {
  return (
    db
      .prepare(
        `SELECT b.* FROM branches b
         JOIN branch_access a ON a.branch_id = b.id
         WHERE a.user_id = ? AND b.project_id = ?
         ORDER BY b.code`,
      )
      .all(userId, projectId) as Row[]
  ).map(toBranch);
}

/**
 * The two ids one forecasting project answers to.
 *
 * The service mints `prj-ds_abc123` as a project id over the dataset id
 * `ds_abc123`, and both appear in our URLs — the chooser links the project id,
 * a branch records the dataset id it was split from. Every access check has to
 * recognise both, or the same dashboard is guarded under one id and wide open
 * under the other.
 *
 * The prefix is the service's convention, hardcoded here reluctantly. If it
 * ever changes, this is the one place to change it.
 */
function idVariants(forecastProjectId: string): [string, string] {
  return forecastProjectId.startsWith("prj-")
    ? [forecastProjectId, forecastProjectId.slice("prj-".length)]
    : [forecastProjectId, `prj-${forecastProjectId}`];
}

/**
 * The branch that claims a forecasting project, if any.
 *
 * This is what turns a dashboard URL into an access question: `prj-abc` is not
 * a thing this layer owns, but a branch may have staked a claim on it, and if
 * one has then only that branch's people may open it.
 */
export function findBranchByForecastProject(forecastProjectId: string): Branch | null {
  const [a, b] = idVariants(forecastProjectId);
  const row = db
    .prepare("SELECT * FROM branches WHERE forecast_project_id IN (?, ?)")
    .get(a, b) as Row | undefined;
  return row ? toBranch(row) : null;
}

/**
 * Of these forecasting projects, which may this user open.
 *
 * The same rule `requireForecastAccess` enforces, in set form, so the branch
 * switcher and the guard cannot disagree — two copies of this rule would drift,
 * and the drift would look like a project that is listed but 404s when opened.
 *
 * **Default deny.** An earlier version treated a project no branch claims as
 * ungoverned and therefore visible to everyone, on the reasoning that a dataset
 * pushed straight into the forecasting service was not this layer's business.
 * That failed open: three abandoned uploads were readable — real rows, real
 * quantities — by every signed-in account on the service. Now an unclaimed
 * dataset is visible only to whoever uploaded it, and one this layer has never
 * seen is visible to nobody.
 */
export function visibleForecastProjects(
  userId: string,
  candidateIds: string[],
): Set<string> {
  // Keyed by both id forms, so a candidate list mixing project ids and dataset
  // ids resolves either way.
  const claimed = new Map(
    (
      db
        .prepare(
          `SELECT b.forecast_project_id AS id,
                  (p.owner_id = ?1 OR a.user_id IS NOT NULL) AS allowed
           FROM branches b
           JOIN projects p           ON p.id = b.project_id
           LEFT JOIN branch_access a ON a.branch_id = b.id AND a.user_id = ?1
           WHERE b.forecast_project_id IS NOT NULL`,
        )
        .all(userId) as Row[]
    ).flatMap((row) => {
      const allowed = num(row, "allowed") === 1;
      return idVariants(text(row, "id")).map((id) => [id, allowed] as const);
    }),
  );

  return new Set(
    candidateIds.filter((id) => {
      const allowed = claimed.get(id);
      if (allowed !== undefined) return allowed;
      // Unclaimed: theirs only if they are the one who uploaded it.
      return uploaderOf(id) === userId;
    }),
  );
}

/**
 * The locations this user may see inside a forecasting project, or null for
 * "no restriction".
 *
 * Used to scope the in-app assistant: it is handed only the rows the person
 * looking at it is entitled to, so the model never sees another branch's
 * numbers and cannot quote them back.
 *
 * Matching a branch `code` against a row's `location_id` is sound for any
 * dataset that came through this app: the column the owner confirmed as the
 * branch id is the same column the forecasting service maps to `location_id`.
 * A dataset pushed straight into that service has no branch claiming it and is
 * unrestricted here, which is the same rule `requireForecastAccess` applies.
 *
 * This narrows what the assistant reads. It is not a substitute for the backend
 * filtering by location — see gap B11 in migration-report.md.
 */
export function accessibleLocations(
  userId: string,
  forecastProjectId: string,
): string[] | null {
  const [a, b] = idVariants(forecastProjectId);
  const claiming = db
    .prepare(
      `SELECT br.code, p.owner_id, acc.user_id AS granted
       FROM branches br
       JOIN projects p             ON p.id = br.project_id
       LEFT JOIN branch_access acc ON acc.branch_id = br.id AND acc.user_id = ?1
       WHERE br.forecast_project_id IN (?2, ?3)`,
    )
    .all(userId, a, b) as Row[];

  // Nothing claims it yet. Unrestricted for the uploader — there are no
  // branches to scope to — and unreachable for anyone else, which
  // `requireForecastAccess` enforces before this is ever consulted.
  if (claiming.length === 0) {
    return uploaderOf(forecastProjectId) === userId ? null : [];
  }

  // The owner of the project that claims it sees the whole network. This is the
  // distinction that has to be kept: returning their branch list instead of
  // null reads as "restricted to these", and the caller then scopes an owner to
  // one branch — which is what happened before this was split out.
  if (claiming.some((row) => text(row, "owner_id") === userId)) return null;

  return claiming
    .filter((row) => row.granted !== null)
    .map((row) => text(row, "code"));
}

/**
 * Who uploaded this dataset through the app, if anyone.
 *
 * A dataset exists here before any branch claims it: the owner has uploaded the
 * file but not yet answered the column questions. This is what keeps it theirs
 * in the meantime.
 *
 * Null means the auth layer has never seen it — a dataset pushed straight into
 * the forecasting service. That is now a reason to refuse, not to allow.
 */
export function uploaderOf(datasetId: string): string | null {
  const [a, b] = idVariants(datasetId);
  const row = db
    .prepare("SELECT owner_id FROM uploads WHERE dataset_id IN (?, ?) ORDER BY created_at DESC")
    .get(a, b) as Row | undefined;
  return row ? text(row, "owner_id") : null;
}

export function hasBranchAccess(userId: string, branchId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM branch_access WHERE user_id = ? AND branch_id = ?")
      .get(userId, branchId) !== undefined
  );
}

export function grantAccess(userId: string, branchId: string, grantedBy: string): void {
  db.prepare(
    `INSERT INTO branch_access (user_id, branch_id, granted_by)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id, branch_id) DO NOTHING`,
  ).run(userId, branchId, grantedBy);
}

export function revokeAccess(userId: string, branchId: string): void {
  db.prepare("DELETE FROM branch_access WHERE user_id = ? AND branch_id = ?").run(
    userId,
    branchId,
  );
}

/** Everyone involved in a project, with the branches each of them holds. */
export function listMemberships(projectId: string): Membership[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT u.id, u.name, u.email FROM users u
       LEFT JOIN branch_access a   ON a.user_id = u.id
       LEFT JOIN branches ab       ON ab.id = a.branch_id AND ab.project_id = ?1
       LEFT JOIN access_requests r ON r.user_id = u.id AND r.project_id = ?1
       WHERE u.role = 'manager' AND (ab.id IS NOT NULL OR r.id IS NOT NULL)
       ORDER BY u.name`,
    )
    .all(projectId) as Row[];

  return rows.map((row) => {
    const userId = text(row, "id");
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS n FROM access_requests
         WHERE user_id = ? AND project_id = ? AND status = 'pending'`,
      )
      .get(userId, projectId) as Row;
    return {
      user_id: userId,
      name: text(row, "name"),
      email: text(row, "email"),
      branches: listAccessibleBranches(userId, projectId),
      pending: num(pending, "n"),
    };
  });
}

/* --------------------------------------------------------- access requests */

function toRequest(row: Row): AccessRequest {
  return {
    id: text(row, "id"),
    project_id: text(row, "project_id"),
    branch_id: text(row, "branch_id"),
    branch_code: text(row, "branch_code"),
    branch_location: text(row, "branch_location"),
    user_id: text(row, "user_id"),
    user_name: text(row, "user_name"),
    user_email: text(row, "user_email"),
    note: row.note === null ? null : text(row, "note"),
    status: text(row, "status") as RequestStatus,
    created_at: text(row, "created_at"),
    decided_at: row.decided_at === null ? null : text(row, "decided_at"),
  };
}

const REQUEST_SELECT = `
  SELECT r.*, b.code AS branch_code, b.location AS branch_location,
         u.name AS user_name, u.email AS user_email
  FROM access_requests r
  JOIN branches b ON b.id = r.branch_id
  JOIN users u    ON u.id = r.user_id`;

/**
 * Asks for a branch.
 *
 * Re-requesting a branch that was rejected reopens the same row, which is what
 * a manager means when they ask again after talking to the owner.
 */
export function requestAccess(input: {
  userId: string;
  projectId: string;
  branchId: string;
  note: string | null;
}): void {
  db.prepare(
    `INSERT INTO access_requests (id, project_id, branch_id, user_id, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, branch_id) DO UPDATE SET
       status     = 'pending',
       note       = excluded.note,
       created_at = datetime('now'),
       decided_at = NULL,
       decided_by = NULL`,
  ).run(
    `req_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    input.projectId,
    input.branchId,
    input.userId,
    input.note,
  );
}

export function listRequests(projectId: string, status?: RequestStatus): AccessRequest[] {
  const sql = status
    ? `${REQUEST_SELECT} WHERE r.project_id = ? AND r.status = ? ORDER BY r.created_at`
    : `${REQUEST_SELECT} WHERE r.project_id = ? ORDER BY r.created_at DESC`;
  const rows = (status
    ? db.prepare(sql).all(projectId, status)
    : db.prepare(sql).all(projectId)) as Row[];
  return rows.map(toRequest);
}

export function listRequestsByUser(userId: string, projectId: string): AccessRequest[] {
  return (
    db
      .prepare(`${REQUEST_SELECT} WHERE r.user_id = ? AND r.project_id = ? ORDER BY b.code`)
      .all(userId, projectId) as Row[]
  ).map(toRequest);
}

export function getRequest(id: string): AccessRequest | null {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as Row | undefined;
  return row ? toRequest(row) : null;
}

/**
 * The owner's decision. Approving grants the branch in the same transaction,
 * so a request can never read "approved" while the access it promised is
 * missing.
 */
export function decideRequest(
  requestId: string,
  decision: "approved" | "rejected",
  deciderId: string,
): void {
  const request = getRequest(requestId);
  if (!request) return;

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE access_requests
       SET status = ?, decided_at = datetime('now'), decided_by = ?
       WHERE id = ?`,
    ).run(decision, deciderId, requestId);
    if (decision === "approved") grantAccess(request.user_id, request.branch_id, deciderId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/* -------------------------------------------------------------------- seed */

/**
 * Demo accounts: one owner and two managers.
 *
 * Passwords are shown on the sign-in screen because this is a prototype and
 * the point is that anyone can walk the flow. They are still stored hashed —
 * the demo should not teach the schema a bad habit it will keep in production.
 */
export const DEMO_ACCOUNTS = [
  {
    email: "sari.wijaya@gmail.com",
    password: "owner1234",
    name: "Sari Wijaya",
    organisation: "PT ABC Distribution",
    role: "owner" as const,
    blurb: "Owns the project and the subscription. Uploads data, invites managers, decides access.",
  },
  {
    email: "budi.santoso@gmail.com",
    password: "manager1234",
    name: "Budi Santoso",
    organisation: "PT ABC Distribution",
    role: "manager" as const,
    blurb: "Branch manager. Sees only the branches the owner has approved.",
  },
  {
    email: "rina.pratiwi@gmail.com",
    password: "manager1234",
    name: "Rina Pratiwi",
    organisation: "PT ABC Distribution",
    role: "manager" as const,
    blurb: "Branch manager. Starts with nothing until she requests access.",
  },
];

/**
 * The demo network: one PT, three branches, each pointing at a dashboard that
 * already exists in the forecasting service.
 *
 * The forecast project ids are duplicated from `app/dummy-data/projects.ts`
 * rather than imported, because this layer is not allowed to import from the
 * app (see the boundary rule in eslint.config.mjs). Three string literals is
 * the right price for keeping the dependency arrow pointing one way.
 *
 * Ids are fixed rather than random so that seeding is idempotent, safe under
 * parallel workers, and the invite link stays the same between restarts.
 */
const DEMO_PROJECT = {
  id: "prj_demo_abcdist",
  name: "Jaringan Cabang Nasional",
  organisation: "PT ABC Distribution",
  token: "demo-abc-distribution-network",
  filename: "sales_2026_konsolidasi.csv",
  rows: 284_500,
  branches: [
    {
      id: "brc_demo_jkt",
      code: "CAB-JKT-01",
      location: "Jakarta Pusat",
      productCount: 428,
      rowCount: 128_400,
      forecastProjectId: "prj-abc",
    },
    {
      id: "brc_demo_bdg",
      code: "PBR-BDG-01",
      location: "Bandung",
      productCount: 192,
      rowCount: 42_800,
      forecastProjectId: "prj-nus",
    },
    {
      id: "brc_demo_sby",
      code: "CAB-SBY-01",
      location: "Surabaya",
      productCount: 1_204,
      rowCount: 113_300,
      forecastProjectId: "prj-sgr",
    },
  ],
};

/**
 * Does this person own the seeded demo network?
 *
 * The three fixture dashboards (`prj-abc`, `prj-nus`, `prj-sgr`) belong to the
 * demo story, not to the product. They already stay out of a new owner's
 * workspace because the seeded branches claim them and the access filter
 * catches them — but that works by accident: a fourth fixture with no claiming
 * branch would show up in every workspace ever created.
 *
 * So the rule is stated rather than inferred. Fixtures are for whoever owns the
 * seeded network, and for nobody else.
 */
export function ownsDemoNetwork(userId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM projects WHERE id = ? AND owner_id = ?")
      .get(DEMO_PROJECT.id, userId) !== undefined
  );
}

/**
 * Idempotent, and safe when several processes start at once — `next build`
 * collects pages in parallel workers, all of which import this module against
 * the same file. The check is an optimisation; `ON CONFLICT DO NOTHING` is what
 * actually makes it safe, because a check followed by an insert is a race.
 */
function seed(): void {
  // Deleting the database is not enough to get an empty instance: this runs on
  // every import, so the demo accounts and network come straight back on the
  // next request. `AUTH_SKIP_SEED=1` is how you keep a wiped instance wiped —
  // for demoing sign-up from nothing, or for a deployment that should never
  // carry demo credentials.
  if (envFlag("AUTH_SKIP_SEED") === "1") return;

  const insert = db.prepare(
    `INSERT INTO users (id, email, name, organisation, role, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (email) DO NOTHING`,
  );
  for (const account of DEMO_ACCOUNTS) {
    if (findUserByEmail(account.email)) continue;
    insert.run(
      `usr_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      account.email,
      account.name,
      account.organisation,
      account.role,
      hashPassword(account.password),
    );
  }

  const owner = findUserByEmail(DEMO_ACCOUNTS[0].email);
  if (!owner) return;

  // Fixed ids plus DO NOTHING, for the same reason as the accounts above: this
  // runs in every worker that imports the module, concurrently.
  db.prepare(
    `INSERT INTO projects (id, name, organisation, owner_id, invite_token,
                           dataset_filename, dataset_rows,
                           branch_id_column, branch_location_column, product_column)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'kode_cabang', 'lokasi_cabang', 'kode_produk')
     ON CONFLICT (id) DO NOTHING`,
  ).run(
    DEMO_PROJECT.id,
    DEMO_PROJECT.name,
    DEMO_PROJECT.organisation,
    owner.id,
    DEMO_PROJECT.token,
    DEMO_PROJECT.filename,
    DEMO_PROJECT.rows,
  );

  const insertBranch = db.prepare(
    `INSERT INTO branches (id, project_id, code, location, product_count, row_count,
                           forecast_project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  );
  for (const branch of DEMO_PROJECT.branches) {
    insertBranch.run(
      branch.id,
      DEMO_PROJECT.id,
      branch.code,
      branch.location,
      branch.productCount,
      branch.rowCount,
      branch.forecastProjectId,
    );
  }
}

seed();
