"use client";

import { useCallback, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import type { ProjectedPoint } from "./geometry";

/**
 * Hover readout for a chart (design.md §86: clean, compact, no heavy glass).
 *
 * The only client-side work in the chart. Coordinates are already projected on
 * the server, and because the x axis is uniformly spaced the nearest point is
 * an O(1) index calculation rather than a search. State holds a single integer,
 * so a pointer move re-renders the crosshair and tooltip only.
 */
export function ChartHoverLayer({
  points,
  unit,
}: {
  points: ProjectedPoint[];
  unit: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const last = points.length - 1;

  const pick = useCallback(
    (clientX: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const ratio = (clientX - rect.left) / rect.width;
      const index = Math.min(last, Math.max(0, Math.round(ratio * last)));
      setActive((current) => (current === index ? current : index));
    },
    [last]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setActive((current) => {
        const base = current ?? last;
        return Math.min(last, Math.max(0, base + (e.key === "ArrowRight" ? 1 : -1)));
      });
    },
    [last]
  );

  const point = active === null ? null : points[active];

  return (
    <div
      ref={ref}
      className="absolute inset-0 cursor-crosshair"
      onPointerMove={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((c) => c ?? last)}
      onBlur={() => setActive(null)}
      tabIndex={0}
      role="application"
      aria-label="Chart values. Use the left and right arrow keys to read each period."
    >
      {point && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-brand-deep/35"
            style={{ left: `${point.x}%` }}
          />
          {point.yActual !== null && (
            <Dot x={point.x} y={point.yActual} color="var(--color-series-actual)" />
          )}
          {point.yForecast !== null && (
            <Dot x={point.x} y={point.yForecast} color="var(--color-series-forecast)" />
          )}
          {point.ySales !== null && (
            <Dot x={point.x} y={point.ySales} color="var(--color-series-sales)" />
          )}

          <div
            className={`pointer-events-none absolute top-2 z-[var(--z-popover)] min-w-40 rounded-sm border border-border-subtle bg-surface-card p-3 shadow-card ${
              point.x > 60 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"
            }`}
            style={{ left: `${point.x}%` }}
            role="status"
          >
            <p className="text-meta font-semibold text-ink-tertiary">{formatDate(point.t)}</p>
            <dl className="mt-2 space-y-1.5">
              {point.actual !== null && (
                <Row
                  label="Actual"
                  value={`${formatNumber(point.actual)} ${unit}`}
                  color="var(--color-series-actual)"
                />
              )}
              {point.sales !== null && (
                <Row
                  label="Sales"
                  value={`${formatNumber(point.sales)} ${unit}`}
                  color="var(--color-series-sales)"
                />
              )}
              {point.forecast !== null && point.actual === null && (
                <>
                  <Row
                    label="Forecast"
                    value={`${formatNumber(point.forecast)} ${unit}`}
                    color="var(--color-series-forecast)"
                  />
                  {point.lower !== null && point.upper !== null && (
                    <Row
                      label="80% interval"
                      value={`${formatNumber(point.lower)} – ${formatNumber(point.upper)}`}
                      color="var(--color-series-band)"
                    />
                  )}
                </>
              )}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <span
      className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
      style={{ left: `${x}%`, top: `${y}%`, backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-1.5 text-meta text-ink-secondary">
        <span
          className="size-2 rounded-xs"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        {label}
      </dt>
      <dd className="text-body-sm font-semibold text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}
