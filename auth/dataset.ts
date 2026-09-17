/**
 * Reading the owner's upload, and splitting it into branches.
 *
 * This is the auth layer's only contact with the data itself, and it stays
 * deliberately shallow: it finds out which branches exist and how much of the
 * file belongs to each, because that is the unit of access a manager is
 * granted. Forecasting, cleaning and canonicalisation are the other backend's
 * job and are not duplicated here.
 *
 * ponytail: the whole file is read into memory and scanned twice — once to
 * profile the columns, once to split. Fine to about 100 MB; stream it with
 * readline if uploads outgrow that.
 */
import { readFileSync } from "node:fs";

export interface CsvProfile {
  columns: string[];
  /** A few distinct values per column, so the owner can check our guess. */
  samples: Record<string, string[]>;
  rowCount: number;
}

export interface BranchSplit {
  code: string;
  location: string;
  productCount: number;
  rowCount: number;
}

const SAMPLE_LIMIT = 4;

/** Indonesian exports are as likely to be semicolon or tab separated as comma. */
function detectDelimiter(headerLine: string): string {
  const counts = [",", ";", "\t", "|"].map(
    (d) => [d, headerLine.split(d).length] as const,
  );
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * One CSV line into fields, respecting quotes and doubled quotes inside them.
 * Small enough to keep, and a quoted product name containing the delimiter is
 * common enough that a plain `split` would silently shift every later column.
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      fields.push(field.trim());
      field = "";
    } else field += char;
  }
  fields.push(field.trim());
  return fields;
}

function readLines(csv: string): string[] {
  return csv.split(/\r?\n/).filter((line) => line.trim() !== "");
}

/** Columns, sample values and a row count. Nothing is interpreted yet. */
export function profileCsv(csv: string): CsvProfile {
  const lines = readLines(csv);
  if (lines.length < 2) {
    throw new Error("That file has a header but no rows.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const columns = parseLine(lines[0], delimiter);
  const samples: Record<string, string[]> = Object.fromEntries(columns.map((c) => [c, []]));

  // Distinct values from the first rows only — enough to recognise a column,
  // and it keeps the profile cheap on a large export.
  for (const line of lines.slice(1, 400)) {
    const fields = parseLine(line, delimiter);
    columns.forEach((column, i) => {
      const value = fields[i];
      const seen = samples[column];
      if (value && seen.length < SAMPLE_LIMIT && !seen.includes(value)) seen.push(value);
    });
  }

  return { columns, samples, rowCount: lines.length - 1 };
}

/* ----------------------------------------------------------------- guesses */

/**
 * What each question starts out answered with.
 *
 * A guess, never a decision: the review screen shows it next to real values
 * from the file and the owner confirms or changes it before anything is split.
 */
const KEYWORDS = {
  branchId: ["branch_id", "branch", "cabang", "kode_cabang", "outlet", "store_id", "site"],
  branchLocation: ["location", "lokasi", "kota", "city", "region", "wilayah", "alamat", "area"],
  product: ["product", "produk", "sku", "item", "barang", "kode_brg", "material"],
} as const;

export type ColumnQuestion = keyof typeof KEYWORDS;

export function guessColumn(columns: string[], question: ColumnQuestion): string | null {
  const normalise = (value: string) => value.toLowerCase().replace(/[\s-]+/g, "_");
  const keywords = KEYWORDS[question];

  // Exact name first, then a containment match, so "branch_id" wins over
  // "branch_location" when both are present.
  for (const keyword of keywords) {
    const exact = columns.find((c) => normalise(c) === keyword);
    if (exact) return exact;
  }
  for (const keyword of keywords) {
    const partial = columns.find((c) => normalise(c).includes(keyword));
    if (partial) return partial;
  }
  return null;
}

/* ------------------------------------------------------------------- split */

/**
 * Groups the file by branch.
 *
 * One pass: for every row, note its branch, the location it reports and the
 * product it carries. The location a branch is filed under is the one most of
 * its rows agree on, so a handful of typos in a 100k-row export do not create
 * a second branch or mislabel a real one.
 */
export function splitByBranch(
  csv: string,
  columns: { branchId: string; branchLocation: string; product: string },
): BranchSplit[] {
  const lines = readLines(csv);
  const delimiter = detectDelimiter(lines[0]);
  const header = parseLine(lines[0], delimiter);

  const index = {
    branch: header.indexOf(columns.branchId),
    location: header.indexOf(columns.branchLocation),
    product: header.indexOf(columns.product),
  };
  for (const [name, i] of Object.entries(index)) {
    if (i === -1) throw new Error(`Column for ${name} is not in this file.`);
  }

  const rows = new Map<string, number>();
  const products = new Map<string, Set<string>>();
  const locations = new Map<string, Map<string, number>>();

  for (const line of lines.slice(1)) {
    const fields = parseLine(line, delimiter);
    const code = fields[index.branch];
    if (!code) continue;

    rows.set(code, (rows.get(code) ?? 0) + 1);

    const product = fields[index.product];
    if (product) {
      const set = products.get(code) ?? new Set<string>();
      set.add(product);
      products.set(code, set);
    }

    const location = fields[index.location];
    if (location) {
      const tally = locations.get(code) ?? new Map<string, number>();
      tally.set(location, (tally.get(location) ?? 0) + 1);
      locations.set(code, tally);
    }
  }

  return [...rows.entries()]
    .map(([code, rowCount]) => {
      const tally = [...(locations.get(code) ?? new Map()).entries()].sort(
        (a, b) => b[1] - a[1],
      );
      return {
        code,
        location: tally[0]?.[0] ?? "Unknown location",
        productCount: products.get(code)?.size ?? 0,
        rowCount,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function readUpload(storedPath: string): string {
  return readFileSync(storedPath, "utf8");
}
