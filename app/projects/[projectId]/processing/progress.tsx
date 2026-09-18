"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobState } from "@/app/dummy-data/types";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertTriangle, Check, Clock, X } from "@/components/ui/icons";
import { cancelJob, pollJob } from "./actions";

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

/**
 * How long the percentage may sit still before this screen says so.
 *
 * Backtesting a wide network genuinely holds one number for a while — a
 * thousand-series run can spend minutes inside one step — so this is not an
 * error, and the run is not cancelled. It is the difference between a screen
 * that is working and a screen that has stopped telling you anything, which is
 * the whole reason a stuck job feels like a broken product.
 */
const STALL_MS = 90_000;

export function ProcessingProgress({
  sequence,
  reviewHref,
  projectId,
  jobId,
  initialJob = null,
}: {
  sequence: JobState[];
  reviewHref: string;
  projectId: string;
  /** Null when there is no live job to follow. */
  jobId: string | null;
  /** The job as the server already read it, so the first paint is real. */
  initialJob?: JobState | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [liveJob, setLiveJob] = useState<JobState | null>(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [stopped, setStopped] = useState(false);
  // Requested, but the run has not noticed yet. Polling deliberately continues
  // through this: the screen should show the run actually stopping rather than
  // assert that it did.
  const [stopping, setStopping] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Last time the percentage actually moved. A ref, not state: it is read to
  // decide whether to flip `stalled`, and writing it must not itself schedule
  // a render inside the poll that just wrote it.
  //
  // `at: 0` rather than a clock read, which is impure in a render. It is never
  // compared before it is replaced: no real progress value equals -1, so the
  // first poll always takes the "moved" branch and stamps a real time.
  const moved = useRef({ progress: -1, at: 0 });

  const job = liveJob ?? sequence[index];
  const done = job.status === "completed";
  const failed = job.status === "failed";
  const cancelled = job.status === "cancelled";

  // Live polling. Stops on a terminal state, and on an error rather than
  // hammering a service that is already unhappy.
  useEffect(() => {
    if (!jobId || done || failed || cancelled || stopped) return;
    let stale = false;

    const timer = setTimeout(async () => {
      try {
        const { job: next } = await pollJob(projectId, jobId);
        if (stale) return;
        setLiveJob(next);

        if (next.progress !== moved.current.progress) {
          moved.current = { progress: next.progress, at: Date.now() };
          setStalled(false);
        } else if (Date.now() - moved.current.at > STALL_MS) {
          setStalled(true);
        }
      } catch {
        if (!stale) {
          setPollError("Lost contact with the forecasting service. Reload to try again.");
        }
      }
    }, POLL_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [jobId, projectId, done, failed, cancelled, stopped, liveJob]);

  // Fixture walk, only when there is no real job behind this screen.
  useEffect(() => {
    if (jobId || done || stopped) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(sequence.length - 1, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [jobId, done, stopped, index, sequence.length]);

  useEffect(() => {
    if (done) router.prefetch(reviewHref);
  }, [done, router, reviewHref]);

  const requestCancel = async () => {
    if (!jobId) return setStopped(true);
    setStopping(true);
    setCancelError(null);
    const { cancelled: accepted, error } = await cancelJob(projectId, jobId);
    if (accepted) return; // Polling carries it the rest of the way.
    // Either the job had already finished or the service was unreachable.
    // Neither is worth trapping someone on this screen for.
    setStopping(false);
    setCancelError(error);
    setStopped(true);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body font-semibold text-brand-deep">
          {failed
            ? "Processing failed"
            : cancelled
              ? "Run cancelled"
              : done
                ? "Processing complete"
                : stopping
                  ? "Stopping…"
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

      {cancelled && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-border-default bg-surface-sunken px-3 py-2.5 text-body-sm text-ink-secondary"
          role="status"
        >
          <X size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />
          Stopped at {job.progress}%. Nothing was saved from this run — start it again from the
          review screen when you are ready.
        </p>
      )}

      {stalled && !done && !failed && !cancelled && !stopping && !stopped && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-risk/25 bg-status-risk-surface px-3 py-2.5 text-body-sm text-ink"
          role="status"
        >
          <Clock size={15} className="mt-0.5 shrink-0 text-status-risk" />
          <span>
            Still on {job.progress}% after {Math.round(STALL_MS / 1000)} seconds. Backtesting a
            wide network can genuinely sit on one number this long, so nothing is necessarily
            wrong — but you do not have to sit here for it.
          </span>
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
        ) : cancelled ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={reviewHref}>Back to project</ButtonLink>
            <ButtonLink href="/projects" variant="secondary">
              All projects
            </ButtonLink>
          </div>
        ) : stopped ? (
          <div>
            <p className="flex items-start gap-2 text-body-sm leading-relaxed text-ink-secondary">
              <X size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />
              {/* Said plainly, because the alternative is a button that claims to
                  kill something and does not. This stops the watching, which is
                  the part that belongs to this screen. */}
              <span>
                {cancelError
                  ? `Stopped watching, but the run could not be cancelled: ${cancelError} It may still be going.`
                  : "Stopped watching. This run had already finished or was past the point of stopping, so it may still complete on its own."}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href="/projects" variant="secondary">
                All projects
              </ButtonLink>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  // Fresh mark, or a run that moved while nobody watched is
                  // declared stalled the moment we look again.
                  moved.current = { progress: -1, at: Date.now() };
                  setStalled(false);
                  setStopped(false);
                }}
              >
                Watch again
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-body-sm text-ink-secondary">
              {stopping
                ? "Asked the forecasting service to stop. It stops at the end of the batch it is in, so this can take a few seconds."
                : "You can leave this page. Processing continues and the project appears as ready when it finishes."}
            </p>
            <Button
              type="button"
              variant={stalled ? "secondary" : "ghost"}
              size="sm"
              disabled={stopping}
              onClick={requestCancel}
            >
              <X size={14} />
              {stopping ? "Stopping…" : "Stop this run"}
            </Button>
          </div>
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
