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
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "auth-check-"));
process.env.AUTH_DATA_DIR = dir;
delete process.env.AUTH_SECRET;

// Dynamic, so the temp data directory is set before the module opens its file.
const db = await import("./db.ts");
const { guessColumn, profileCsv, splitByBranch } = await import("./dataset.ts");

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

  // Owner: every branch claiming the project.
  assert.deepEqual(db.accessibleLocations(demoOwner.id, "prj-abc")?.sort(), ["CAB-JKT-01"]);
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

check("a forecasting project no branch claims is unrestricted, not empty", () => {
  // null and [] are different answers: null lets the assistant read everything,
  // [] lets it read nothing. Confusing them either leaks or breaks.
  assert.equal(db.accessibleLocations(demoOwner.id, "prj-orphan"), null);
});

check("an unclaimed forecasting project stays visible to everyone", () => {
  // Nothing in this layer claims it, so it is not this layer's to refuse.
  const budi = db.findUserByEmail("budi.santoso@gmail.com")!;
  assert.deepEqual([...db.visibleForecastProjects(budi.id, ["prj-orphan"])], ["prj-orphan"]);
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
