import type { ReactNode } from "react";

/**
 * Empty and error states (design.md §70, §71).
 * Calm, no illustration, and always carrying the recovery path.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <h3 className="text-section font-semibold text-brand-deep">{title}</h3>
      <p className="max-w-sm text-body text-ink-secondary">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <h3 className="text-section font-semibold text-status-critical">{title}</h3>
      <p className="max-w-sm text-body text-ink-secondary">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Inline unavailability — used wherever the dataset cannot support a metric.
 * Never render a zero in its place (frontend_user_flow.md §47).
 */
export function Unavailable({ reason }: { reason: string }) {
  return (
    <div>
      <p className="text-metric font-semibold text-ink-disabled">Unavailable</p>
      <p className="mt-1 text-meta text-ink-tertiary">{reason}</p>
    </div>
  );
}
