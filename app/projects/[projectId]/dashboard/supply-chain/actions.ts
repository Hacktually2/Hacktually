"use server";

import { runSimulation } from "@/app/dummy-data/simulation";
import type { ScenarioInput, ScenarioOutcome } from "@/app/dummy-data/types";
import { requireSession } from "@/lib/session";

/**
 * Runs a what-if scenario. Stands in for
 * POST /api/v1/simulate/{dataset_id}
 *
 * A server action rather than arithmetic in the browser, so the scenario and
 * the live recommendation always come from the same engine. A second copy of
 * the formulas in React would eventually drift from the real one, and the whole
 * point of a simulator is that you can trust what it tells you.
 */
export async function simulate(
  datasetId: string,
  scenario: ScenarioInput
): Promise<ScenarioOutcome> {
  await requireSession();
  return runSimulation(datasetId, scenario);
}
