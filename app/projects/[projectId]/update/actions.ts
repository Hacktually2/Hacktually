"use server";

import { getMergePreview } from "@/app/dummy-data";
import type { MergePreview } from "@/app/dummy-data/types";

/**
 * Dry run of a merge. Stands in for
 * POST /api/v1/datasets/{id}/append?dry_run=true
 *
 * A server action rather than a client fetch, so the real version can hold the
 * uploaded file server-side and never expose the dataset to the browser.
 */
export async function previewMerge(
  datasetId: string,
  filename: string
): Promise<MergePreview> {
  return getMergePreview(datasetId, filename);
}
