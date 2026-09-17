"use server";

import { getActivity } from "@/app/dummy-data";
import type { ActivityEvent } from "@/app/dummy-data/types";
import { requireSession } from "@/lib/session";

/**
 * Loads the activity log on demand.
 *
 * The log is only ever read inside a modal, and it grows without bound as a
 * project is worked on. Sending it with every page would put a year of history
 * into the payload of a dashboard nobody opened the log on, so the header
 * carries only the count and the entries are fetched when the panel opens.
 */
export async function loadActivity(): Promise<ActivityEvent[]> {
  // Server actions are reachable by direct POST, so the guard is repeated here
  // rather than assumed from the layout.
  await requireSession();
  return getActivity();
}
