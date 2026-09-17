"use server";

/**
 * Confirming the canonical mapping, and starting the forecast it unblocks.
 *
 * Two backend calls, in order, because the second is meaningless without the
 * first: confirming the mapping is what runs cleaning and profiling, and a
 * forecast needs a profiled dataset. They are one action rather than two
 * buttons because they are one decision — the user said "yes, these columns are
 * right", and everything after that is the machine's work.
 *
 * The confirm call is slow (it reads the whole file), so the timeout in
 * `client.ts` is deliberately generous. If it times out the action says so
 * instead of leaving the screen pretending nothing happened.
 */
import { redirect } from "next/navigation";
import { requireForecastAccess } from "@/auth/session";
import { backend } from "@/lib/backend/client";
import { attempt } from "@/lib/backend/source";

export type ConfirmMappingState = { error: string | null };

export async function confirmMapping(
  _previous: ConfirmMappingState,
  formData: FormData,
): Promise<ConfirmMappingState> {
  const projectId = String(formData.get("project_id") ?? "");
  const datasetId = String(formData.get("dataset_id") ?? "");
  // Reachable by direct POST. Branch access is re-checked, not assumed from the
  // page that rendered the form.
  await requireForecastAccess(projectId);

  // Only the columns the user actually changed travel; the backend keeps its
  // own detection for the rest.
  const overrides: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("override:") && typeof value === "string" && value) {
      overrides[key.slice("override:".length)] = value;
    }
  }

  const confirmed = await attempt(() => backend.confirmMapping(datasetId, overrides));
  if (!confirmed.ok) return { error: confirmed.error };

  const mode = String(formData.get("mode") ?? "ritel");
  const started = await attempt(() => backend.startForecast(datasetId, 30, mode));
  if (!started.ok) {
    // The mapping is confirmed and the data is clean — only the forecast failed,
    // and saying so is more useful than a generic error on a screen whose work
    // did land.
    return {
      error: `Mapping confirmed, but the forecast could not be started: ${started.error}`,
    };
  }

  redirect(`/projects/${projectId}/processing?job=${started.data.job_id}`);
}
