import Link from "next/link";
import type { RiskLevel, SupplyChainResponse } from "@/app/dummy-data/types";
import { ArrowRight } from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";

/**
 * Inventory posture.
 *
 * Replaces a row of four identical stat cards. Four equal boxes gave "2 at
 * stockout risk" and "11 healthy" the same weight, when one needs a decision
 * today and the other needs nothing at all, and they showed no proportion: a
 * reader had to add the numbers up to learn that most of the portfolio is fine.
 *
 * So: one sentence with the decision in it, one bar for the shape of the
 * portfolio, and the bands as working filters rather than decoration.
 */
const BAND = {
  critical: { fill: "bg-status-critical", dot: "bg-status-critical" },
  at_risk: { fill: "bg-status-risk", dot: "bg-status-risk" },
  watch: { fill: "bg-status-watch", dot: "bg-status-watch" },
  healthy: { fill: "bg-status-healthy", dot: "bg-status-healthy" },
} as const satisfies Record<RiskLevel, unknown>;

export function PostureStrip({
  summary,
  headline,
  activeRisk,
  hrefFor,
}: {
  summary: SupplyChainResponse["summary"];
  headline: SupplyChainResponse["headline"];
  /** Current ?risk= value, so a chip can show it is the one in force. */
  activeRisk: string;
  /** Builds a link that keeps whatever other filters are set. */
  hrefFor: (risk: string) => string;
}) {
  const total = summary.reduce((sum, b) => sum + b.series_count, 0) || 1;

  return (
    <section className="surface-card p-5" aria-label="Inventory posture">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-page font-bold text-brand-deep">
            <span data-numeric>{headline.attention_count}</span> of{" "}
            <span data-numeric>{headline.total_count}</span> items need a decision
          </h2>
          <p className="mt-1.5 text-body leading-relaxed text-ink-secondary">
            {headline.detail}
          </p>
        </div>

        {/* The number a planner actually leaves with. */}
        <div className="shrink-0 border-l border-border-subtle pl-6">
          <p className="text-meta font-medium text-ink-tertiary">Units to order</p>
          <p className="mt-1 text-metric-lg leading-none font-bold text-brand-deep" data-numeric>
            {formatNumber(headline.units_to_order)}
          </p>
          <Link
            href={hrefFor("attention")}
            className="mt-2 inline-flex items-center gap-1 text-body-sm font-semibold text-brand-blue-ink hover:text-brand-blue-hover"
          >
            Work the list
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Proportion, which four separate integers never showed. */}
      <div
        className="mt-5 flex h-2 w-full overflow-hidden rounded-xs"
        role="img"
        aria-label={summary
          .map((b) => `${b.label}: ${b.series_count}`)
          .join(", ")}
      >
        {summary.map((band) => (
          <div
            key={band.risk}
            className={BAND[band.risk].fill}
            style={{ width: `${(band.series_count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Bands as filters. Previously these were inert cards whose own comment
          claimed they were the filter affordance. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {summary.map((band) => {
          const active = activeRisk === band.risk;
          return (
            <Link
              key={band.risk}
              href={hrefFor(active ? "all" : band.risk)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-body-sm transition-colors duration-(--duration-fast) ${
                active
                  ? "border-brand-deep/30 bg-brand-pale text-brand-deep"
                  : "border-border-subtle text-ink-secondary hover:border-border-strong/50 hover:text-brand-deep"
              }`}
            >
              <span className={`size-2 rounded-full ${BAND[band.risk].dot}`} aria-hidden="true" />
              {band.label}
              <span className="font-semibold text-ink" data-numeric>
                {band.series_count}
              </span>
            </Link>
          );
        })}

        {activeRisk !== "all" && (
          <Link
            href={hrefFor("all")}
            className="ml-1 text-body-sm font-medium text-brand-blue-ink hover:text-brand-blue-hover"
          >
            Show all
          </Link>
        )}
      </div>
    </section>
  );
}
