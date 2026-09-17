/**
 * Receiving an owner's export.
 *
 * Deliberately NOT a `"use server"` module. Every export of one of those is a
 * public endpoint the browser can call by id, and these two are internal steps
 * in a larger flow — `linkUploadToDataset` in particular should never be
 * callable on its own, or someone could point their upload at a dataset that is
 * not theirs. The only caller is `app/projects/new/actions.ts`, which is the
 * real action and does its own checks.
 */
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, createUpload, getUpload, setUploadDataset } from "./db";
import { profileCsv } from "./dataset";
import { requireSession } from "./session";

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export type RegisterResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: string };

/**
 * Stores the file and profiles its columns. Nothing is split and nothing is
 * forecast: this only gathers what the review screen needs to ask its
 * questions.
 */
export async function registerUpload(file: File): Promise<RegisterResult> {
  const user = await requireSession();
  if (user.role !== "owner") {
    return { ok: false, error: "Only a project owner can upload a dataset." };
  }
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
    return { ok: false, error: `${file.name} is not a CSV. Export as CSV and try again.` };
  }
  // Repeated server-side: the check in the upload panel is a courtesy, this one
  // is the boundary.
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: "That file is larger than 64 MB. Split the export and upload in parts.",
    };
  }

  const csv = await file.text();
  let profile;
  try {
    profile = profileCsv(csv);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That file could not be read.",
    };
  }

  const storedPath = path.join(UPLOAD_DIR, `${randomBytes(8).toString("hex")}.csv`);
  await writeFile(storedPath, csv, "utf8");

  return {
    ok: true,
    uploadId: createUpload({
      ownerId: user.id,
      filename: file.name,
      storedPath,
      columns: profile.columns,
      samples: profile.samples,
      rowCount: profile.rowCount,
    }),
  };
}

/** Records which forecasting dataset this upload became. */
export async function linkUploadToDataset(
  uploadId: string,
  datasetId: string,
): Promise<void> {
  const user = await requireSession();
  if (!getUpload(uploadId, user.id)) return;
  setUploadDataset(uploadId, datasetId);
}
