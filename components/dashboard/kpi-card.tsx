import Link from "next/link";
import type { KpiMetric } from "@/app/dummy-data/types";
import { ArrowDown, ArrowRight, ArrowUp, Minus } from "@/components/ui/icons";
import { formatByUnit, formatPercent, unitLabel } from "@/lib/format";

/**
 * KPI card (design.md §34, §35).
 *
 * A stable content surface — not glass, no gradient, no giant icon. Category is
 * carried by a small accent rule rather than by colouring the whole card.
 */
const ACCENT = {
  demand: "bg-brand-blue",
  forecast: "bg-accent-purple",
  inventory: "bg-brand-deep",
  risk: "bg-status-risk",
} as const;

export function KpiCard({ kpi }: { kpi: KpiMetric }) {
  const body = (
    <>
      <span className={`block h-1 w-8 rounded-full ${ACCENT[kpi.accent]}`} aria-hidden="true" />

      <p className="mt-3 text-body-sm font-medium text-ink-secondary">{kpi.label}</p>

      {kpi.value === null ? (
        <>
          <p className="mt-1.5 text-metric leading-tight font-semibold text-ink-disabled">
            Unavailable
          </p>
          <p className="mt-1.5 text-meta leading-relaxed text-ink-tertiary">
            {kpi.unavailable_reason}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="text-metric leading-none font-bold text-brand-deep"
              data-numeric
            >
              {formatByUnit(kpi.value, kpi.unit)}
            </span>
            {unitLabel(kpi.unit, kpi.value) && (
              <span className="text-body-sm font-medium text-ink-tertiary">
                {unitLabel(kpi.unit, kpi.value)}
              </span>
            )}
          </p>
          <p className="mt-1.5 text-meta text-ink-tertiary">{kpi.context}</p>
          {kpi.comparison && <Comparison comparison={kpi.comparison} />}
        </>
      )}

      {kpi.href && (
        <span className="mt-3 flex items-center gap-1 text-meta font-semibold text-brand-blue">
          View detail
          <ArrowRight
            size={13}
            className="transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
          />
        </span>
      )}
    </>
  );

  const className =
    "surface-card group flex flex-col p-5 transition-shadow duration-(--duration-base) ease-(--ease-standard)";

  // The card is the drill-down entry point, not a dead-end metric
  // (frontend_user_flow.md §16).
  return kpi.href ? (
    <Link href={kpi.href} className={`${className} hover:shadow-card`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Comparison({
  comparison,
}: {
  comparison: NonNullable<KpiMetric["comparison"]>;
}) {
  const { direction, delta_percent, label } = comparison;
  const Icon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  // Neutral by default: a rise in demand is not automatically good news, and a
  // rise in risk is not automatically bad. The label carries the meaning.
  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-meta text-ink-secondary">
      <Icon size={13} className="text-brand-deep" />
      <span className="font-semibold text-ink" data-numeric>
        {formatPercent(Math.abs(delta_percent))}
      </span>
      {label}
    </p>
  );
}
