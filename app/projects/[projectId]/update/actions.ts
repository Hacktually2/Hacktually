"use server";

import { getMergePreview } from "@/app/dummy-data";
import type { Sourced } from "@/lib/backend/source";
import type { MergePreview } from "@/app/dummy-data/types";
import { requireForecastAccess } from "@/auth/session";

/**
 * Dry run of a merge. Stands in for
 * POST /api/v1/datasets/{id}/append?dry_run=true
 *
 * A server action rather than a client fetch, so the real version can hold the
 * uploaded file server-side and never expose the dataset to the browser.
 */
export async function previewMerge(
  projectId: string,
  datasetId: string,
  filename: string
): Promise<Sourced<MergePreview>> {
  // Reachable by direct POST, so branch access is checked here and not assumed
  // from the page that rendered the form.
  await requireForecastAccess(projectId);
  return getMergePreview(datasetId, filename);
}
