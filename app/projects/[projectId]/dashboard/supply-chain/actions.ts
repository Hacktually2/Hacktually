"use server";

import { runSimulation } from "@/app/dummy-data/simulation";
import type {
  PlanningParameters,
  ScenarioInput,
  ScenarioOutcome,
} from "@/app/dummy-data/types";
import { requireForecastAccess, requireForecastOwner, requireSession } from "@/lib/session";
import { backend } from "@/lib/backend/client";
import { attempt } from "@/lib/backend/source";

/**
 * Runs a what-if scenario. **Owner only.**
 *
 * A server action rather than arithmetic in the browser, so the scenario and
 * the live recommendation always come from the same engine. A second copy of
 * the formulas in React would eventually drift from the real one, and the whole
 * point of a simulator is that you can trust what it tells you.
 *
 * Why the owner and not a branch manager: the levers here are supplier lead
 * time, service level, MOQ and order capacity. Those are network-wide
 * commercial terms, not a branch's operating choices — a manager moving them
 * would be planning with numbers they do not set, on a catalogue they only
 * partly see. Managers get their branch's recommendations; the owner gets to
 * ask what the network would do differently.
 *
 * The check is here and not only in the page because a Server Action is
 * reachable by direct POST. Hiding the panel is presentation; this is the
 * control.
 */
export async function simulate(
  projectId: string,
  datasetId: string,
  scenario: ScenarioInput
): Promise<ScenarioOutcome> {
  await requireForecastOwner(projectId);
  return runSimulation(datasetId, scenario);
}

/**
 * Saves planning parameters. Stands in for
 * PUT /api/v1/datasets/{id}/parameters
 *
 * The real one persists them and re-runs the decision engine; the forecast is
 * untouched, because none of these inputs feed the model.
 */
export async function savePlanningParameters(
  _datasetId: string,
  _next: PlanningParameters
): Promise<{ ok: true }> {
  await requireSession();
  return { ok: true };
}

/* ------------------------------------------------------- procurement alert */

export type AlertState = {
  error: string | null;
  /** The message the backend says it sent, verbatim. Null before sending. */
  result: { sent: boolean; message: string; reason: string | null } | null;
};

/**
 * Sends a stockout alert to the procurement channel. THE ONE WRITE.
 *
 * Mirrors the guarantee the MCP tool makes in `backend/app/integrations/
 * mcp_server.py`: an agent may recommend a purchase order, a person raises it.
 * There the agent must call once to preview and again with `confirmed=True`.
 * `POST /api/v1/alerts/slack` has no such dry run — it sends on the first call —
 * so the confirmation happens in the UI instead: the user sees every item that
 * will be alerted on, and this action only runs after they agree to that list.
 *
 * What they cannot preview is the exact Slack formatting, which only the
 * backend knows. So the message it reports sending is shown back afterwards,
 * verbatim, as the record of what went out.
 */
export async function sendProcurementAlert(
  projectId: string,
  datasetId: string,
  seriesIds: string[],
): Promise<AlertState> {
  // Reachable by direct POST, and it is a write to an outside channel, so the
  // branch check is repeated here rather than assumed from the page.
  await requireForecastAccess(projectId);

  if (seriesIds.length === 0) {
    return { error: "Select at least one item to alert on.", result: null };
  }

  const sent = await attempt(() => backend.sendSlackAlert(datasetId, seriesIds));
  if (!sent.ok) return { error: sent.error, result: null };

  return {
    error: null,
    result: {
      sent: sent.data.sent,
      message: sent.data.message ?? "",
      reason: sent.data.reason ?? null,
    },
  };
}
