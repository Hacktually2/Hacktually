"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobState } from "@/app/dummy-data/types";
import { ButtonLink } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";

/**
 * Processing progress (design.md §54, frontend_user_flow.md §58).
 *
 * Operational status, not theatre. Against the real backend this component is
 * unchanged — the timer is replaced by polling GET /api/v1/jobs/{job_id}, which
 * returns exactly the JobState shape rendered here.
 */
const STEP_MS = 1600;

export function ProcessingProgress({
  sequence,
  reviewHref,
}: {
  sequence: JobState[];
  reviewHref: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const job = sequence[index];
  const done = job.status === "completed";

  useEffect(() => {
    if (done) {
      router.prefetch(reviewHref);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => Math.min(sequence.length - 1, i + 1)), STEP_MS);
    return () => clearTimeout(timer);
  }, [done, index, sequence.length, router, reviewHref]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body font-semibold text-brand-deep">
          {done ? "Processing complete" : (job.message ?? "Processing dataset")}
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
