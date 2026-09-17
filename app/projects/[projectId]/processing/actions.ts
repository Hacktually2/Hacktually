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

export async function pollJob(
  projectId: string,
  jobId: string,
): Promise<{ job: JobState; note: string | null }> {
  await requireForecastAccess(projectId);
  const { data, note } = await getJob(jobId);
  return { job: data, note };
}
