import type { DemandClass, RiskLevel } from "@/app/dummy-data/types";
import { AlertOctagon, AlertTriangle, CheckCircle, Clock } from "./icons";

/**
 * Status semantics (design.md §49, §64).
 *
 * Colour is never the only signal — every badge carries an icon and a written
 * label. Risk vocabulary is fixed here so Overview and Supply Chain can never
 * drift into different words for the same backend state.
 */
const RISK_META = {
  critical: {
    label: "Stockout risk",
    className: "text-status-critical bg-status-critical-surface border-status-critical/25",
    Icon: AlertOctagon,
  },
  at_risk: {
    label: "At risk",
    className: "text-status-risk bg-status-risk-surface border-status-risk/25",
    Icon: AlertTriangle,
  },
  watch: {
    label: "Watch",
    className: "text-status-watch bg-status-watch-surface border-status-watch/25",
    Icon: Clock,
  },
  healthy: {
    label: "Healthy",
    className: "text-status-healthy bg-status-healthy-surface border-status-healthy/25",
    Icon: CheckCircle,
  },
} as const satisfies Record<RiskLevel, unknown>;

export function riskLabel(risk: RiskLevel): string {
  return RISK_META[risk].label;
}

export function RiskBadge({
  risk,
  label,
  size = "md",
}: {
  risk: RiskLevel;
  /** Backend-supplied label wins, so the API stays the vocabulary owner. */
  label?: string;
  size?: "sm" | "md";
}) {
  const meta = RISK_META[risk];
  const pad = size === "sm" ? "h-6 px-2 text-meta gap-1" : "h-7 px-2.5 text-body-sm gap-1.5";
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${pad} ${meta.className}`}
    >
      <meta.Icon size={size === "sm" ? 12 : 14} />
      {label ?? meta.label}
    </span>
  );
}

/** A 6px dot for dense table cells where a full badge would be too heavy. */
export function RiskDot({ risk }: { risk: RiskLevel }) {
  const fill = {
    critical: "bg-status-critical",
    at_risk: "bg-status-risk",
    watch: "bg-status-watch",
    healthy: "bg-status-healthy",
  }[risk];
  return <span className={`inline-block size-1.5 rounded-full ${fill}`} aria-hidden="true" />;
}

/* --------------------------------------------------------- demand classes */

const DEMAND_META = {
  smooth: { label: "Smooth", className: "text-brand-blue-ink bg-brand-blue-soft border-brand-blue/20" },
  erratic: {
    label: "Erratic",
    className: "text-demand-erratic bg-brand-pale-soft border-demand-erratic/20",
  },
  intermittent: {
    label: "Intermittent",
    className: "text-demand-lumpy bg-accent-lavender-soft border-accent-lavender/35",
  },
  lumpy: {
    label: "Lumpy",
    className: "text-demand-lumpy bg-accent-purple-soft border-accent-purple/25",
  },
} as const satisfies Record<DemandClass, unknown>;

export function DemandClassBadge({ demandClass }: { demandClass: DemandClass }) {
  const meta = DEMAND_META[demandClass];
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-meta font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * Demand-class colours for inline styles (charts, segmented bars, sparklines).
 *
 * Written out in full on purpose. Tailwind v4 only emits a `@theme` variable
 * whose name it can find in the source, so building the name dynamically —
 * `var(--color-demand-${key})` — silently produces an undefined colour. Never
 * construct a token name from a variable.
 */
export const DEMAND_COLOR: Record<DemandClass, string> = {
  smooth: "var(--color-demand-smooth)",
  erratic: "var(--color-demand-erratic)",
  intermittent: "var(--color-demand-intermittent)",
  lumpy: "var(--color-demand-lumpy)",
};
