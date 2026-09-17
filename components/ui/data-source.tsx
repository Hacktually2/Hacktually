import { AlertTriangle, Database } from "@/components/ui/icons";

/**
 * Says, on the screen itself, that what you are looking at is not live.
 *
 * The one rule this component exists to enforce: a fallback is never silent.
 * A dashboard quietly showing fixtures is worse than one that breaks, because
 * nobody finds out until someone orders stock against an invented number.
 *
 * Renders nothing when the data is live, so it can sit unconditionally in any
 * page and disappear the moment the endpoint lands.
 */
export function DataSource({ note, className }: { note: string | null; className?: string }) {
  if (!note) return null;

  // Two different problems, two different urgencies: an endpoint nobody has
  // built yet is expected, a service that stopped answering is not.
  const notBuilt = note.includes("not implemented");

  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-meta font-medium ${
        notBuilt
          ? "border-border-strong/40 bg-surface-sunken/60 text-ink-secondary"
          : "border-status-watch/30 bg-status-watch-surface text-status-watch"
      } ${className ?? ""}`}
    >
      {notBuilt ? (
        <Database size={14} className="mt-px shrink-0" />
      ) : (
        <AlertTriangle size={14} className="mt-px shrink-0" />
      )}
      {note}
    </p>
  );
}

/**
 * A value the backend did not send.
 *
 * Never a zero and never a guess: `null` from the adapter means "not
 * measurable from this response", and a planner reading a dash knows not to
 * act on it. `reason` is available to a title tooltip for the why.
 */
export function Unavailable({ reason }: { reason?: string }) {
  return (
    <span className="text-ink-disabled" title={reason ?? "Not supplied by the forecasting service"}>
      —
    </span>
  );
}
