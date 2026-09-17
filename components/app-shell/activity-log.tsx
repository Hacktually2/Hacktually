import type { ActivityEvent, ActivityKind } from "@/app/dummy-data/types";
import { AlertTriangle, Database, FileText, Layers, Shield, Upload } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";

/**
 * The data-change log.
 *
 * Answers one question: why do the numbers look different from last time. Only
 * events that changed the data or the results are recorded, so navigation and
 * filtering never appear here.
 */
const KIND_META = {
  dataset_uploaded: { label: "Upload", Icon: Upload, tone: "text-brand-blue-ink" },
  dataset_updated: { label: "Data update", Icon: Database, tone: "text-brand-blue-ink" },
  mapping_confirmed: { label: "Mapping", Icon: FileText, tone: "text-ink-secondary" },
  forecast_generated: { label: "Forecast", Icon: Layers, tone: "text-accent-purple" },
  health_changed: { label: "Data health", Icon: AlertTriangle, tone: "text-status-watch" },
  recommendations_refreshed: { label: "Recommendations", Icon: Shield, tone: "text-status-healthy" },
} as const satisfies Record<ActivityKind, unknown>;

/** Groups events under a day heading, newest first. */
function groupByDay(events: ActivityEvent[]) {
  const groups = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const day = event.at.slice(0, 10);
    const bucket = groups.get(day);
    if (bucket) bucket.push(event);
    else groups.set(day, [event]);
  }
  return [...groups.entries()];
}

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No changes recorded"
        description="Uploads, mapping changes and forecast runs will appear here as they happen."
      />
    );
  }

  return (
    <div className="space-y-6">
      {groupByDay(events).map(([day, dayEvents]) => (
        <section key={day}>
          <h3 className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
            {formatDateTime(`${day}T00:00:00+07:00`).split(",")[0]}
          </h3>

          <ol className="mt-3 space-y-3">
            {dayEvents.map((event) => {
              const meta = KIND_META[event.kind];
              return (
                <li key={event.event_id} className="flex gap-3">
                  <span
                    className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken ${meta.tone}`}
                  >
                    <meta.Icon size={14} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-body-sm font-semibold text-ink">{event.summary}</p>
                      <time
                        className="shrink-0 text-meta text-ink-tertiary"
                        dateTime={event.at}
                        data-numeric
                      >
                        {formatDateTime(event.at).split(", ")[1]}
                      </time>
                    </div>

                    <p className="mt-0.5 text-meta text-ink-tertiary">
                      {meta.label} · {event.organisation} · {event.project_name} · {event.actor}
                    </p>

                    {event.details.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {event.details.map((detail) => (
                          <li
                            key={detail}
                            className="flex gap-2 text-body-sm text-ink-secondary"
                          >
                            <span
                              className="mt-1.5 size-1 shrink-0 rounded-full bg-border-strong"
                              aria-hidden="true"
                            />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
