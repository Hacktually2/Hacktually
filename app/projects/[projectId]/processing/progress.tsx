"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobState } from "@/app/dummy-data/types";
import { ButtonLink } from "@/components/ui/button";
import { AlertTriangle, Check } from "@/components/ui/icons";
import { pollJob } from "./actions";

/**
 * Processing progress (design.md §54, frontend_user_flow.md §58).
 *
 * Operational status, not theatre. With a `jobId` this polls the real job and
 * every number on screen is the backend's; without one — an old project, or a
 * page reopened after the job id was lost — it walks the fixture sequence so
 * the screen still explains what the pipeline does.
 */
const POLL_MS = 1500;
const STEP_MS = 1600;

export function ProcessingProgress({
  sequence,
  reviewHref,
  projectId,
  jobId,
}: {
  sequence: JobState[];
  reviewHref: string;
  projectId: string;
  /** Null when there is no live job to follow. */
  jobId: string | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [liveJob, setLiveJob] = useState<JobState | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const job = liveJob ?? sequence[index];
  const done = job.status === "completed";
  const failed = job.status === "failed";

  // Live polling. Stops on a terminal state, and on an error rather than
  // hammering a service that is already unhappy.
  useEffect(() => {
    if (!jobId || done || failed) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const { job: next } = await pollJob(projectId, jobId);
        if (!cancelled) setLiveJob(next);
      } catch {
        if (!cancelled) {
          setPollError("Lost contact with the forecasting service. Reload to try again.");
        }
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, projectId, done, failed, liveJob]);

  // Fixture walk, only when there is no real job behind this screen.
  useEffect(() => {
    if (jobId || done) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(sequence.length - 1, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [jobId, done, index, sequence.length]);

  useEffect(() => {
    if (done) router.prefetch(reviewHref);
  }, [done, router, reviewHref]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body font-semibold text-brand-deep">
          {failed
            ? "Processing failed"
            : done
              ? "Processing complete"
              : (job.message ?? "Processing dataset")}
        </p>
        <p className="text-body-sm font-semibold text-ink" data-numeric>
          {job.progress}%
        </p>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Processing progress"
      >
        <div
          className="h-full rounded-full bg-brand-blue transition-[width] duration-(--duration-slow) ease-(--ease-emphasized)"
          style={{ width: `${job.progress}%` }}
        />
      </div>

      {(failed || pollError) && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {pollError ?? job.message ?? "The forecasting service could not finish this run."}
        </p>
      )}

      <ol className="mt-7 space-y-3.5">
        {job.steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <StepMarker state={step.state} />
            <div className="min-w-0 flex-1">
              <p
                className={`text-body-sm ${
                  step.state === "pending"
                    ? "text-ink-tertiary"
                    : step.state === "active"
                      ? "font-semibold text-brand-deep"
                      : "font-medium text-ink"
                }`}
              >
                {step.label}
              </p>
              {step.detail && <p className="text-meta text-ink-tertiary">{step.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 border-t border-border-subtle pt-5">
        {done ? (
          <ButtonLink href={reviewHref} size="lg">
            Review detected columns
          </ButtonLink>
        ) : (
          <p className="text-body-sm text-ink-secondary">
            You can leave this page. Processing continues and the project appears as ready when
            it finishes.
          </p>
        )}
      </div>
    </div>
  );
}

function StepMarker({ state }: { state: "done" | "active" | "pending" | "failed" }) {
  if (state === "done") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-ink-on-brand">
        <Check size={12} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-brand-blue">
        <span className="size-2 animate-pulse rounded-full bg-brand-blue" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-border-default" />
  );
}
