/**
 * Runnable check for the auth layer: `npm run check:auth`.
 *
 * Covers the parts that would fail quietly and expensively — password
 * verification, who can see which project, what approving a request actually
 * grants, and whether the branch split counts the file correctly. Runs against
 * a throwaway database in a temp directory, so it never touches `data/`.
 *
 * Not a test framework, deliberately. It is asserts and a exit code, which is
 * all a pre-commit sanity check needs.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "auth-check-"));
process.env.AUTH_DATA_DIR = dir;
delete process.env.AUTH_SECRET;
// The seed flag now falls back to the repo's .env, so a developer who has set
// AUTH_SKIP_SEED=1 for an empty instance would otherwise run these checks
// against an unseeded database. The suite owns its fixtures either way.
process.env.AUTH_SKIP_SEED = "0";

// Dynamic, so the temp data directory is set before the module opens its file.
const db = await import("./db.ts");
const { guessColumn, profileCsv, splitByBranch } = await import("./dataset.ts");
const checkout = await import("./checkout.ts");

let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks++;
  console.log(`  ok  ${name}`);
}

/* ------------------------------------------------------------- credentials */

check("demo accounts are seeded: one owner, two managers", () => {
  const users = db.DEMO_ACCOUNTS.map((a) => db.findUserByEmail(a.email));
  assert.equal(users.filter(Boolean).length, 3);
  assert.equal(users.filter((u) => u?.role === "owner").length, 1);
  assert.equal(users.filter((u) => u?.role === "manager").length, 2);
});

check("the same password hashes differently every time", () => {
  assert.notEqual(db.hashPassword("owner1234"), db.hashPassword("owner1234"));
});

check("a correct password authenticates, a wrong one does not", () => {
  const [owner] = db.DEMO_ACCOUNTS;
  assert.ok(db.authenticate(owner.email, owner.password));
  assert.equal(db.authenticate(owner.email, "wrong"), null);
  assert.equal(db.authenticate("nobody@gmail.com", owner.password), null);
});

check("email lookup ignores case", () => {
  assert.ok(db.findUserByEmail("SARI.WIJAYA@GMAIL.COM"));
});

check("only the demo profile carries the PT ABC fixture dashboards", () => {
  // A workspace created at checkout must start empty. This is asserted rather
  // than left to the access filter, which only hides the fixtures because the
  // seeded branches happen to claim all three.
  const owner = db.findUserByEmail("sari.wijaya@gmail.com")!;
  assert.equal(db.ownsDemoNetwork(owner.id), true);

  const fresh = db.createUser({
    email: `fresh-${Date.now()}@contoh.co.id`,
    name: "Fresh Owner",
    organisation: "PT Contoh Baru",
    role: "owner",
    password: "rahasia123",
  });
  assert.equal(db.ownsDemoNetwork(fresh.id), false);
  assert.equal(db.listProjectsForUser(fresh).length, 0, "a new owner owns nothing");

  // And the fixture dashboards are not reachable by them either.
  for (const id of ["prj-abc", "prj-nus", "prj-sgr"]) {
    assert.equal(db.visibleForecastProjects(fresh.id, [id]).size, 0, id);
  }
});

/* ----------------------------------------------------------- company token */

check("a company token admits managers, and only managers", () => {
  const owner = db.findUserByEmail("sari.wijaya@gmail.com")!;
  const issued = db.issueCompanyToken(owner.id);
  assert.ok(issued.token.length >= 40, "256 bits of randomness, base64url");

  const resolved = db.ownerOfCompanyToken(issued.token);
  assert.equal(resolved?.id, owner.id);

  // Nothing that is not the token resolves.
  for (const junk of ["", "nope", issued.token.slice(0, -1), issued.token + "x"]) {
    assert.equal(db.ownerOfCompanyToken(junk), null, `accepted: ${junk}`);
  }
});

check("rotating a company token invalidates the previous one", () => {
  // Rotation IS revocation — one row per owner, so there is no stale token
  // left resolving alongside the new one.
  const owner = db.findUserByEmail("sari.wijaya@gmail.com")!;
  const first = db.issueCompanyToken(owner.id).token;
  const second = db.issueCompanyToken(owner.id).token;

  assert.notEqual(first, second);
  assert.equal(db.ownerOfCompanyToken(first), null, "the old token still works");
  assert.equal(db.ownerOfCompanyToken(second)?.id, owner.id);

  db.revokeCompanyToken(owner.id);
  assert.equal(db.ownerOfCompanyToken(second), null, "revoked token still works");
  assert.equal(db.getCompanyToken(owner.id), null);
});

check("an expired company token is refused, and reads as simply wrong", () => {
  const owner = db.findUserByEmail("sari.wijaya@gmail.com")!;
  const token = db.issueCompanyToken(owner.id).token;

  // Age the row directly rather than adding a test-only export to the real
  // module. The check owns this database; it is in a temp directory.
  const raw = new DatabaseSync(path.join(dir, "auth.db"));
  raw.prepare("UPDATE company_tokens SET expires_at = datetime('now', '-1 day') WHERE owner_id = ?").run(owner.id);
  raw.close();

  // Same answer as a token that never existed: null. Saying "expired" would
  // confirm it was once real.
  assert.equal(db.ownerOfCompanyToken(token), null);
  assert.equal(db.getCompanyToken(owner.id)?.expired, true);
  db.revokeCompanyToken(owner.id);
});

check("joining a company grants membership and no data", () => {
  const owner = db.findUserByEmail("sari.wijaya@gmail.com")!;
  const joiner = db.createUser({
    email: `joined-${Date.now()}@contoh.co.id`,
    name: "Joined Manager",
    organisation: owner.organisation,
    role: "manager",
    password: "rahasia123",
    companyOf: owner.id,
  });

  assert.equal(joiner.role, "manager", "a company token never mints an owner");
  assert.equal(joiner.company_of, owner.id);
  assert.equal(joiner.organisation, owner.organisation);

  // They can see the owner's projects — that is how they know what to ask for.
  assert.ok(db.listProjectsForUser(joiner).length > 0);
  // And they hold nothing in any of them.
  for (const project of db.listProjectsForUser(joiner)) {
    assert.equal(db.listAccessibleBranches(joiner.id, project.project_id).length, 0);
  }
  assert.ok(db.listCompanyMembers(owner.id).some((m) => m.id === joiner.id));
});

/* ------------------------------------------------------------ checkout gate */

check("only a valid checkout pass unlocks owner sign-up", () => {
  const pass = checkout.issueCheckoutPass("jaringan");
  assert.equal(checkout.readCheckoutPass(pass)?.id, "jaringan");

  // Everything that is not a pass this server signed must read as no pass at
  // all — sign-up creates an OWNER, so a forged one is a self-granted role.
  for (const junk of [
    undefined,
    "",
    "nonsense",
    "no-dot-separator",
    pass.split(".")[0], // payload with the signature stripped off
    `${pass.split(".")[0]}.forgedsignature`,
    `${Buffer.from(JSON.stringify({ plan: "jaringan", exp: Date.now() + 1e6 })).toString("base64url")}.x`,
  ]) {
    assert.equal(checkout.readCheckoutPass(junk), null, `accepted: ${junk}`);
  }
});

check("an expired pass is refused", () => {
  // Re-signing a payload with a past expiry proves the check is the clock and
  // not just the signature.
  const payload = Buffer.from(
    JSON.stringify({ plan: "jaringan", exp: Date.now() - 1000 }),
  ).toString("base64url");
  assert.equal(checkout.readCheckoutPass(`${payload}.${db.sign(payload)}`), null);
});

check("a pass cannot be issued for a plan nobody can buy", () => {
  // Derived from the plan list, not hardcoded: this assertion broke once when
  // the tiers were renamed and the contact-only plan moved.
  const contactOnly = checkout.PLANS.filter((plan) => plan.contactOnly);
  assert.ok(contactOnly.length > 0, "expected at least one contact-only plan");

  for (const plan of contactOnly) {
    // A pass naming it must not resolve, or the web form sells something that
    // has no price.
    assert.equal(checkout.readCheckoutPass(checkout.issueCheckoutPass(plan.id)), null, plan.id);
    assert.equal(checkout.findPlan(plan.id), undefined, plan.id);
  }
  assert.equal(checkout.findPlan("bogus"), undefined);

  // And every buyable plan must actually be buyable.
  for (const plan of checkout.PLANS.filter((p) => !p.contactOnly)) {
    assert.equal(checkout.findPlan(plan.id)?.id, plan.id, plan.id);
  }
});

/* ------------------------------------------------- the seeded demo network */

const demoOwner = db.findUserByEmail("sari.wijaya@gmail.com")!;
const demo = db.listProjectsForUser(demoOwner)[0];

check("the demo network is seeded as one PT with three branches", () => {
  assert.equal(demo.organisation, "PT ABC Distribution");
  assert.deepEqual(
    db.listBranches(demo.project_id).map((b) => b.location),
    ["Jakarta Pusat", "Surabaya", "Bandung"],
  );
});

check("each demo branch claims a forecasting project", () => {
  assert.deepEqual(
    db
      .listBranches(demo.project_id)
      .map((b) => b.forecast_project_id)
      .sort(),
    ["prj-abc", "prj-nus", "prj-sgr"],
  );
  assert.equal(db.findBranchByForecastProject("prj-nus")?.code, "PBR-BDG-01");
  assert.equal(db.findBranchByForecastProject("prj-unknown"), null);
});

check("seeding twice does not duplicate the network", () => {
  // The seed runs on every import, including in each parallel build worker.
  assert.equal(db.listProjectsForUser(demoOwner).length, 1);
  assert.equal(db.listBranches(demo.project_id).length, 3);
});

check("the owner may open every branch dashboard, a stranger none", () => {
  const candidates = ["prj-abc", "prj-nus", "prj-sgr"];
  assert.deepEqual([...db.visibleForecastProjects(demoOwner.id, candidates)].sort(), candidates);
  assert.equal(
    db.visibleForecastProjects(db.findUserByEmail("budi.santoso@gmail.com")!.id, candidates).size,
    0,
  );
});

check("the assistant's location scope follows branch access", () => {
  const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
  const jakarta = db.listBranches(demo.project_id).find((b) => b.code === "CAB-JKT-01")!;

  // The owner of the claiming project is unrestricted — null, not a list. A
  // list would read as "restricted to these" and scope them to one branch.
  assert.equal(db.accessibleLocations(demoOwner.id, "prj-abc"), null);
  // Manager with no grant: claimed, but nothing allowed. Empty, NOT null —
  // null would mean "unrestricted" and hand the assistant every branch.
  assert.deepEqual(db.accessibleLocations(budi.id, "prj-abc"), []);

  db.grantAccess(budi.id, jakarta.id, demoOwner.id);
  assert.deepEqual(db.accessibleLocations(budi.id, "prj-abc"), ["CAB-JKT-01"]);
  db.revokeAccess(budi.id, jakarta.id);
});

check("both id forms of one forecasting project are guarded the same", () => {
  // The service answers to prj-ds_x and ds_x. If only one is recognised the
  // dashboard is guarded under that id and wide open under the other.
  const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
  assert.equal(db.findBranchByForecastProject("prj-abc")?.code, "CAB-JKT-01");
  assert.equal(db.findBranchByForecastProject("abc")?.code, "CAB-JKT-01");

  for (const id of ["prj-abc", "abc"]) {
    assert.deepEqual(db.accessibleLocations(budi.id, id), [], `${id} leaked`);
    assert.equal(db.visibleForecastProjects(budi.id, [id]).size, 0, `${id} visible`);
  }
});

check("an outsider can see the branch list to request from, but holds nothing", () => {
  // The project id is the shareable link: a manager opens it, sees the branches
  // and asks for the ones they run. Seeing the LIST is the point; holding any
  // of it is not, and the data still goes through requireForecastAccess.
  const outsider = db.findUserByEmail("budi.santoso@gmail.com")!;
  const all = db.listBranches(demo.project_id);
  assert.ok(all.length > 0, "the project has branches to list");
  assert.equal(
    db.listAccessibleBranches(outsider.id, demo.project_id).length,
    0,
    "an outsider holds no branch"
  );
  // And none of the project's forecasting dashboards are reachable by them.
  for (const branch of all) {
    if (!branch.forecast_project_id) continue;
    assert.equal(
      db.visibleForecastProjects(outsider.id, [branch.forecast_project_id]).size,
      0,
      branch.code
    );
  }
});

check("a multi-branch manager is still scoped to one branch, never to all", () => {
  // The leak this replaced: holding two of eight branches produced an unscoped
  // request, so the response carried every branch and the owner's own totals.
  // `accessibleLocations` must report exactly what is held; `branchScope` then
  // picks one of them. Tested here at the data layer because branchScope needs
  // a request context.
  const rina = db.findUserByEmail("rina.pratiwi@gmail.com")!;
  const branches = db.listBranches(demo.project_id);
  const two = branches.slice(0, 2);
  for (const branch of two) db.grantAccess(rina.id, branch.id, demoOwner.id);

  const held = db.accessibleLocations(rina.id, "prj-abc") ?? [];
  assert.deepEqual(held, ["CAB-JKT-01"], "only branches claiming prj-abc count");
  assert.equal(db.accessibleLocations(demoOwner.id, "prj-abc"), null, "owner unrestricted");

  // Holding some branches must never read as unrestricted. null is the value
  // that means "may see everything", and it must not appear here.
  assert.notEqual(db.accessibleLocations(rina.id, "prj-abc"), null);

  for (const branch of two) db.revokeAccess(rina.id, branch.id);
});

check("a dataset nobody uploaded and no branch claims belongs to nobody", () => {
  // This used to read "unclaimed means unrestricted", and it failed open:
  // abandoned uploads were readable by every account on the service. A dataset
  // this layer has never seen is now refused, not shared.
  const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
  for (const user of [demoOwner, budi]) {
    assert.equal(db.visibleForecastProjects(user.id, ["prj-orphan"]).size, 0);
    // [] not null: null means "unrestricted", which is what leaked.
    assert.deepEqual(db.accessibleLocations(user.id, "prj-orphan"), []);
  }
});

check("an upload belongs to its uploader until branches claim it", () => {
  // The window between uploading a file and answering the column questions: the
  // dataset exists, no branch claims it, and it has to stay theirs.
  const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
  const stored = path.join(dir, "pending.csv");
  writeFileSync(stored, "a,b\n1,2\n");

  const uploadId = db.createUpload({
    ownerId: demoOwner.id,
    filename: "pending.csv",
    storedPath: stored,
    columns: ["kode_cabang"],
    samples: { kode_cabang: ["CAB-01"] },
    rowCount: 1,
  });
  db.setUploadDataset(uploadId, "ds_pending");

  assert.equal(db.uploaderOf("ds_pending"), demoOwner.id);
  assert.deepEqual([...db.visibleForecastProjects(demoOwner.id, ["ds_pending"])], ["ds_pending"]);
  assert.equal(db.visibleForecastProjects(budi.id, ["ds_pending"]).size, 0);
  // Unrestricted for the uploader: there are no branches to scope to yet.
  assert.equal(db.accessibleLocations(demoOwner.id, "ds_pending"), null);
  assert.deepEqual(db.accessibleLocations(budi.id, "ds_pending"), []);
});

check("approving one branch reveals exactly one dashboard", () => {
  const rina = db.findUserByEmail("rina.pratiwi@gmail.com")!;
  const jakarta = db.listBranches(demo.project_id).find((b) => b.code === "CAB-JKT-01")!;

  assert.equal(db.hasBranchAccess(rina.id, jakarta.id), false);
  db.grantAccess(rina.id, jakarta.id, demoOwner.id);
  assert.equal(db.hasBranchAccess(rina.id, jakarta.id), true);

  assert.deepEqual(
    [...db.visibleForecastProjects(rina.id, ["prj-abc", "prj-nus", "prj-sgr"])],
    ["prj-abc"],
  );
  db.revokeAccess(rina.id, jakarta.id);
});

check("the session secret survives a second read", () => {
  assert.deepEqual(db.sessionSecret(), db.sessionSecret());
  assert.notEqual(db.sign("a"), db.sign("b"));
});

/* --------------------------------------------------------------------- csv */

// A quoted product name carrying the delimiter, and a branch whose location is
// misspelled on one row — both of which a naive reader gets wrong.
const CSV = [
  "kode_cabang,lokasi_cabang,kode_produk,qty",
  'CAB-01,Jakarta,"BERAS, PREMIUM 5KG",10',
  "CAB-01,Jakarta,MINYAK-2L,4",
  "CAB-01,Jakart,MINYAK-2L,1",
  "CAB-02,Surabaya,MINYAK-2L,7",
].join("\n");

check("the profile finds every column and counts rows, not lines", () => {
  const profile = profileCsv(CSV);
  assert.deepEqual(profile.columns, ["kode_cabang", "lokasi_cabang", "kode_produk", "qty"]);
  assert.equal(profile.rowCount, 4);
  assert.deepEqual(profile.samples["kode_cabang"], ["CAB-01", "CAB-02"]);
});

check("a quoted field containing the delimiter stays one value", () => {
  assert.deepEqual(profileCsv(CSV).samples["kode_produk"], [
    "BERAS, PREMIUM 5KG",
    "MINYAK-2L",
  ]);
});

check("column guesses answer the review screen's questions", () => {
  const columns = profileCsv(CSV).columns;
  assert.equal(guessColumn(columns, "branchId"), "kode_cabang");
  assert.equal(guessColumn(columns, "branchLocation"), "lokasi_cabang");
  assert.equal(guessColumn(columns, "product"), "kode_produk");
  assert.equal(guessColumn(["a", "b"], "branchId"), null);
});

const SPLIT = splitByBranch(CSV, {
  branchId: "kode_cabang",
  branchLocation: "lokasi_cabang",
  product: "kode_produk",
});

check("the split groups rows and distinct products per branch", () => {
  assert.equal(SPLIT.length, 2);
  assert.deepEqual(SPLIT[0], {
    code: "CAB-01",
    location: "Jakarta",
    productCount: 2,
    rowCount: 3,
  });
  assert.equal(SPLIT[1].rowCount, 1);
});

check("a typo'd location does not outvote the branch's real one", () => {
  assert.equal(SPLIT[0].location, "Jakarta");
});

/* -------------------------------------------------------- projects & access */

const owner = demoOwner;
const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
const rina = db.findUserByEmail("rina.pratiwi@gmail.com")!;

const project = db.createProject({
  ownerId: owner.id,
  name: "Sales export 2026",
  organisation: owner.organisation,
  datasetFilename: "penjualan.csv",
  datasetRows: 4,
  branchIdColumn: "kode_cabang",
  branchLocationColumn: "lokasi_cabang",
  productColumn: "kode_produk",
  branches: SPLIT,
});
const [jakarta, surabaya] = db.listBranches(project.project_id);

check("a CSV-split branch claims no forecasting project yet", () => {
  assert.equal(jakarta.forecast_project_id, null);
});

check("a project carries an unguessable invite token", () => {
  assert.ok(project.invite_token.length >= 20);
  assert.equal(db.getProjectByToken(project.invite_token)?.project_id, project.project_id);
  assert.equal(db.getProjectByToken("not-a-token"), null);
});

check("the owner sees their projects, an uninvolved manager sees none", () => {
  // Two: the seeded demo network, plus the one created just above.
  assert.equal(db.listProjectsForUser(owner).length, 2);
  assert.equal(db.listProjectsForUser(budi).length, 0);
});

check("a manager with no grant can reach no branch", () => {
  assert.equal(db.listAccessibleBranches(budi.id, project.project_id).length, 0);
});

check("requesting access makes the project visible but grants nothing", () => {
  db.requestAccess({
    userId: budi.id,
    projectId: project.project_id,
    branchId: jakarta.id,
    note: "I run Jakarta.",
  });
  assert.equal(db.listProjectsForUser(budi).length, 1);
  assert.equal(db.hasBranchAccess(budi.id, jakarta.id), false);
  assert.equal(db.listAccessibleBranches(budi.id, project.project_id).length, 0);
  assert.equal(db.listRequests(project.project_id, "pending").length, 1);
});

check("approving a request grants exactly the branch it asked for", () => {
  const [request] = db.listRequests(project.project_id, "pending");
  db.decideRequest(request.id, "approved", owner.id);

  const branches = db.listAccessibleBranches(budi.id, project.project_id);
  assert.equal(branches.length, 1);
  assert.equal(branches[0].code, "CAB-01");
  assert.equal(db.listRequests(project.project_id, "pending").length, 0);
  assert.equal(db.getRequest(request.id)?.status, "approved");
});

check("rejecting grants nothing", () => {
  db.requestAccess({
    userId: rina.id,
    projectId: project.project_id,
    branchId: surabaya.id,
    note: null,
  });
  const [request] = db.listRequests(project.project_id, "pending");
  db.decideRequest(request.id, "rejected", owner.id);
  assert.equal(db.listAccessibleBranches(rina.id, project.project_id).length, 0);
});

check("re-requesting reopens the one row instead of stacking up", () => {
  db.requestAccess({
    userId: rina.id,
    projectId: project.project_id,
    branchId: surabaya.id,
    note: "Asking again.",
  });
  const pending = db.listRequests(project.project_id, "pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].note, "Asking again.");
  assert.equal(db.listRequestsByUser(rina.id, project.project_id).length, 1);
});

check("granting twice is not an error and does not duplicate", () => {
  db.grantAccess(budi.id, jakarta.id, owner.id);
  db.grantAccess(budi.id, jakarta.id, owner.id);
  assert.equal(db.listAccessibleBranches(budi.id, project.project_id).length, 1);
});

check("revoking removes the branch and only that branch", () => {
  db.grantAccess(budi.id, surabaya.id, owner.id);
  assert.equal(db.listAccessibleBranches(budi.id, project.project_id).length, 2);
  db.revokeAccess(budi.id, surabaya.id);
  const left = db.listAccessibleBranches(budi.id, project.project_id);
  assert.equal(left.length, 1);
  assert.equal(left[0].code, "CAB-01");
});

check("the owner's team list shows each manager with what they hold", () => {
  const members = db.listMemberships(project.project_id);
  assert.deepEqual(
    members.map((m) => [m.email, m.branches.length, m.pending]).sort(),
    [
      ["budi.santoso@gmail.com", 1, 0],
      ["rina.pratiwi@gmail.com", 0, 1],
    ].sort(),
  );
});

/* ----------------------------------------------------------------- uploads */

check("an upload belongs to the owner who made it", () => {
  const stored = path.join(dir, "sample.csv");
  writeFileSync(stored, CSV);
  const id = db.createUpload({
    ownerId: owner.id,
    filename: "penjualan.csv",
    storedPath: stored,
    columns: ["kode_cabang"],
    samples: { kode_cabang: ["CAB-01"] },
    rowCount: 4,
  });
  assert.ok(db.getUpload(id, owner.id));
  assert.equal(db.getUpload(id, budi.id), null);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks} checks passed.`);
