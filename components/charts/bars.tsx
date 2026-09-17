import type { CategoryBar, DemandClass } from "@/app/dummy-data/types";
import { DEMAND_COLOR } from "@/components/ui/status";
import { formatNumber, formatPercent } from "@/lib/format";
import { sparklinePath } from "./geometry";

/**
 * Cross-sectional bars (sales by product / by location).
 *
 * Plain CSS widths rather than SVG: it stays readable at any width, the labels
 * are real text for screen readers, and there is no per-datum effect
 * (design.md §101).
 */
export function BarList({
  items,
  unit = "units",
  accent = "var(--color-brand-blue)",
}: {
  items: CategoryBar[];
  unit?: string;
  accent?: string;
}) {
  // Bars are scaled against the largest item so the comparison stays honest.
  const peak = items.reduce((m, i) => (i.value > m ? i.value : m), 0) || 1;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="truncate text-body-sm font-medium text-ink">{item.label}</span>
            <span className="shrink-0 text-body-sm font-semibold text-ink" data-numeric>
              {formatNumber(item.value)}
              <span className="ml-1 font-normal text-ink-tertiary">{unit}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-xs bg-surface-sunken">
              <div
                className="h-full rounded-xs"
                style={{ width: `${(item.value / peak) * 100}%`, backgroundColor: accent }}
              />
            </div>
            <span className="w-11 shrink-0 text-right text-meta text-ink-tertiary" data-numeric>
              {formatPercent(item.share_percent)}
            </span>
          </div>
          {item.sublabel && (
            <p className="mt-0.5 text-meta text-ink-tertiary">{item.sublabel}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Demand pattern mix — one segmented bar plus a legend, rather than a pie or a
 * set of gauges (design.md §45).
 */
export function DistributionBar({
  segments,
}: {
  segments: { key: DemandClass; label: string; share: number; count: number }[];
}) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-xs">
        {segments.map((s) => (
          <div
            key={s.key}
            style={{
              width: `${s.share}%`,
              backgroundColor: DEMAND_COLOR[s.key],
            }}
            title={`${s.label} ${formatPercent(s.share)}`}
          />
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {segments.map((s) => (
          <div key={s.key}>
            <dt className="flex items-center gap-1.5 text-meta text-ink-secondary">
              <span
                className="size-2 rounded-xs"
                style={{ backgroundColor: DEMAND_COLOR[s.key] }}
                aria-hidden="true"
              />
              {s.label}
            </dt>
            <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
              {formatPercent(s.share)}
              <span className="ml-1.5 text-meta font-normal text-ink-tertiary">
                {formatNumber(s.count)} series
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Compact trend for cards and dense table cells. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--color-brand-blue)",
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
}) {
  const d = sparklinePath(values, 100);
  if (!d) return null;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="overflow-visible"
      role={label ? "img" : "presentation"}
      aria-label={label}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Twelve recent periods as bars — reads correctly for intermittent demand,
 * where a line would imply continuity that the data does not have.
 */
export function MiniBars({
  values,
  color = "var(--color-brand-blue)",
}: {
  values: number[];
  color?: string;
}) {
  const peak = values.reduce((m, v) => (v > m ? v : m), 0) || 1;
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1.5 rounded-t-[2px]"
          style={{
            height: `${Math.max(3, (v / peak) * 100)}%`,
            backgroundColor: v === 0 ? "var(--color-surface-neutral)" : color,
          }}
        />
      ))}
    </div>
  );
}
