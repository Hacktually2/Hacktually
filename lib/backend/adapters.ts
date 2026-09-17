import "server-only";

/**
 * The last two things the backend and the frontend still disagree about.
 *
 * This file was ~380 lines of translation: inverting the mapping table, banding
 * confidence scores, mapping three risk levels onto four, scraping the reorder
 * decomposition for values that had no field of their own. All of it is gone,
 * because the 2026-09-18 backend returns the types in
 * `app/dummy-data/types.ts` directly.
 *
 * What is left is two genuine mismatches. When they close, delete this file.
 */
import type { JobState, JobStatus, PlanningParameters } from "@/app/dummy-data/types";
import type { BackendJob, BackendParams } from "./types";

/* ------------------------------------------------------------------- jobs */

/**
 * The job's `steps` now come from the backend, so the old regex matching on a
 * free-text stage is gone. Only `status` needs a word changed: the service says
 * `running`, and the frontend's `JobStatus` has no such value — it names the
 * phase instead. The active step is that phase.
 */
export function toJobState(job: BackendJob): JobState {
  const active = job.steps.find((step) => step.state === "active");
  const failed = job.steps.find((step) => step.state === "failed");

  const status: JobStatus =
    job.status === "completed"
      ? "completed"
      : job.status === "failed"
        ? "failed"
        : ((active?.key ?? "queued") as JobStatus);

  return {
    job_id: job.job_id,
    dataset_id: job.dataset_id,
    status,
    progress: job.progress,
    steps: job.steps,
    message: job.error ?? job.message ?? failed?.label ?? null,
  };
}

/* ------------------------------------------------------------- parameters */

/**
 * `/datasets/{id}/params` is the one read model still in its own shape.
 *
 * It separates what somebody has set (`current`, keyed by scope) from what the
 * dataset can suggest. The screen wants one row per category with the effective
 * value and where it came from, so those two are merged here — a set value
 * wins, a suggestion fills in behind it, and `source` records which.
 *
 * `lead_time_days` and `moq` come back null when nobody has supplied them.
 * That null is carried through rather than defaulted: they are commercial
 * terms, not something a sales export knows, and the screen asks for them.
 */
export function toPlanningParameters(
  params: BackendParams,
  datasetId: string,
  horizonDays: number,
): PlanningParameters {
  const defaults = params.current.default ?? {};
  const perCategory = params.current.category ?? {};
  const perSeries = params.current.series ?? {};

  // How many SKUs in this category carry their own override.
  const overridesIn = (category: string) =>
    Object.entries(perSeries).filter(
      ([seriesId]) => seriesId.startsWith(`${category}:`) || seriesId.includes(category),
    ).length;

  const pick = (category: string, key: string, suggested: number | null) => {
    const set = perCategory[category]?.[key] ?? defaults[key];
    if (typeof set === "number") return { value: set, source: "user" as const };
    if (suggested !== null) return { value: suggested, source: "dataset" as const };
    return { value: null, source: "default" as const };
  };

  return {
    dataset_id: datasetId,
    horizon_days: horizonDays,
    // Margin and holding cost are not in this response. Null, not zero: the
    // rupiah figures are withheld rather than guessed.
    margin_percent: typeof defaults.margin_percent === "number" ? defaults.margin_percent : null,
    holding_cost_percent:
      typeof defaults.holding_cost_percent === "number" ? defaults.holding_cost_percent : null,
    categories: params.suggested.categories.map((entry) => {
      const leadTime = pick(entry.category, "lead_time_days", entry.lead_time_days);
      const moq = pick(entry.category, "moq", entry.moq);
      const serviceLevel = pick(entry.category, "service_level", null);

      return {
        category: entry.category,
        series_count: entry.series,
        // 0 reads as "no lead time", which is wrong but is what the screen's
        // type allows today; `source` is what tells the user it is unset.
        lead_time_days: leadTime.value ?? 0,
        service_level: serviceLevel.value ?? 95,
        moq: moq.value ?? 0,
        source: leadTime.source,
        overrides: overridesIn(entry.category),
      };
    }),
  };
}
