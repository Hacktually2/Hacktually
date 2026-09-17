/**
 * Attach the network demo file to an auth project, as six branches.
 *
 * The normal path is New project → the review screen splits the upload and
 * each branch gets its own forecasting dataset. That works, and it also means
 * ingesting and forecasting six times. This does the same thing against a
 * dataset already in the forecasting service: all six branches point at it and
 * the branch code is the `?location=` scope, which is the forecasting
 * service's own model of a branch.
 *
 * The branch codes MUST match the location values in the file, because that is
 * what the scoping filters on.
 *
 *   node --experimental-strip-types --no-warnings scripts/seed_network_project.ts <dataset_id>
 */
import { createProject, findUserByEmail, listBranches, listProjectsForUser } from "../auth/db.ts";

const datasetId = process.argv[2];
if (!datasetId) {
  console.error("usage: seed_network_project.ts <dataset_id>");
  process.exit(1);
}

const owner = findUserByEmail("sari.wijaya@gmail.com");
if (!owner) {
  console.error("Owner not seeded yet — open http://localhost:3000/login once first.");
  process.exit(1);
}

// Matches BRANCHES in backend/scripts/make_network_demo.py.
const BRANCHES = [
  { code: "JKT01", location: "Jakarta Pusat", productCount: 86, rowCount: 73186 },
  { code: "SBY01", location: "Surabaya", productCount: 68, rowCount: 57868 },
  { code: "BDG01", location: "Bandung", productCount: 54, rowCount: 45954 },
  { code: "SMG01", location: "Semarang", productCount: 41, rowCount: 34891 },
  { code: "MDN01", location: "Medan", productCount: 37, rowCount: 31487 },
  { code: "DPS01", location: "Denpasar", productCount: 25, rowCount: 21275 },
];

const existing = listProjectsForUser(owner).find(
  (p) => p.dataset_filename === "penjualan_jaringan.csv",
);
if (existing) {
  console.log(`Already attached: ${existing.project_id}`);
  console.log(`  http://localhost:3000/projects/${existing.project_id}/network`);
  process.exit(0);
}

const project = createProject({
  ownerId: owner.id,
  name: "Jaringan Nasional 6 Cabang",
  organisation: "PT ABC Distribution",
  datasetFilename: "penjualan_jaringan.csv",
  datasetRows: 264661,
  branchIdColumn: "branch_id",
  branchLocationColumn: "branch_name",
  productColumn: "product_code",
  branches: BRANCHES.map((b) => ({ ...b, forecastProjectId: datasetId })),
});

console.log(`Created ${project.project_id} with ${listBranches(project.project_id).length} branches`);
console.log(`  http://localhost:3000/projects/${project.project_id}/network`);
