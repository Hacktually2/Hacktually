"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";
import type { HoverData } from "./geometry";

/**
 * Hover readout for a chart (design.md §86: clean, compact, no heavy glass).
 *
 * The only client-side work in the chart. Coordinates are projected on the
 * server and arrive as columns, and because the x axis is uniformly spaced the
 * nearest point is an index calculation rather than a search.
 *
 * State is a single integer, so a pointer move re-renders the crosshair and the
 * tooltip and nothing else.
 */
export function ChartHoverLayer({ data, unit }: { data: HoverData; unit: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Reading getBoundingClientRect on every pointer move forces the browser to
  // flush layout. The box only changes on resize or scroll, so it is measured
  // once and re-measured on those instead.
  const rect = useRef<DOMRect | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const last = data.count - 1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      rect.current = el.getBoundingClientRect();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
    };
  }, []);

  const pick = useCallback(
    (clientX: number) => {
      const box = rect.current;
      if (!box || box.width === 0) return;
      const index = Math.min(
        last,
        Math.max(0, Math.round(((clientX - box.left) / box.width) * last))
      );
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

  const i = active;
  const x = i === null || last === 0 ? 0 : (i / last) * 100;

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
      {i !== null && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-brand-deep/35"
            style={{ left: `${x}%` }}
          />
          {data.yActual[i] !== null && (
            <Dot x={x} y={data.yActual[i]!} color="var(--color-series-actual)" />
          )}
          {data.yForecast[i] !== null && (
            <Dot x={x} y={data.yForecast[i]!} color="var(--color-series-forecast)" />
          )}

          <div
            className={`pointer-events-none absolute top-2 z-[var(--z-popover)] min-w-40 rounded-sm border border-border-subtle bg-surface-card p-3 shadow-card ${
              x > 60 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"
            }`}
            style={{ left: `${x}%` }}
            role="status"
          >
            <p className="text-meta font-semibold text-ink-tertiary">
              {formatDate(data.t[i])}
            </p>
            <dl className="mt-2 space-y-1.5">
              {data.actual[i] !== null && (
                <Row
                  label="Actual"
                  value={`${formatNumber(data.actual[i]!)} ${unit}`}
                  color="var(--color-series-actual)"
                />
              )}
              {data.forecast[i] !== null && data.actual[i] === null && (
                <>
                  <Row
                    label="Forecast"
                    value={`${formatNumber(data.forecast[i]!)} ${unit}`}
                    color="var(--color-series-forecast)"
                  />
                  {data.lower[i] !== null && data.upper[i] !== null && (
                    <Row
                      label="80% interval"
                      value={`${formatNumber(data.lower[i]!)} – ${formatNumber(data.upper[i]!)}`}
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
        <span className="size-2 rounded-xs" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-body-sm font-semibold text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}
