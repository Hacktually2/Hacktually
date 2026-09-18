"use server";

/**
 * One poll of a running forecast job.
 *
 * A server action rather than a client fetch, because the forecasting service
 * has no auth of its own and must never be reachable from a browser. Every poll
 * re-checks branch access, so a manager who loses a branch mid-run stops
 * getting updates about it.
 */
import { getJob } from "@/app/dummy-data";
import type { JobState } from "@/app/dummy-data/types";
import { requireForecastAccess } from "@/auth/session";
import { backend } from "@/lib/backend/client";

export async function pollJob(
  projectId: string,
  jobId: string,
): Promise<{ job: JobState; note: string | null }> {
  await requireForecastAccess(projectId);
  const { data, note } = await getJob(jobId);
  return { job: data, note };
}

/**
 * Stop a running forecast.
 *
 * Same access check as a poll, for the same reason: this is reachable by direct
 * POST, and stopping someone else's run is a thing to be prevented rather than
 * discouraged. The forecasting service marks the job and the run unwinds at its
 * next progress report, so this returns before the work has actually stopped.
 */
export async function cancelJob(
  projectId: string,
  jobId: string,
): Promise<{ cancelled: boolean; error: string | null }> {
  await requireForecastAccess(projectId);
  try {
    const result = await backend.cancelJob(jobId);
    return { cancelled: result.cancelled, error: null };
  } catch (error) {
    // The screen still stops watching either way — see `progress.tsx`. This
    // only decides what it is honest enough to claim happened.
    return {
      cancelled: false,
      error: error instanceof Error ? error.message : "Could not reach the forecasting service.",
    };
  }
}
