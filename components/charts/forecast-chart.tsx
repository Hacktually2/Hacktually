import type { ForecastSeries } from "@/app/dummy-data/types";
import { formatCompact, formatDate, formatDateShort } from "@/lib/format";
import { projectSeries } from "./geometry";
import { ChartHoverLayer } from "./chart-hover";

/**
 * Actual vs forecast (design.md §36–§39).
 *
 * The chart is the primary visual object: no glass over it, no gradient
 * background, minimal gridlines. Past and future are separated by an explicit
 * NOW boundary, and the forecast is distinguishable without colour because it
 * is dashed.
 *
 * Rendered entirely on the server. Projection happens once here; the optional
 * hover layer receives the finished coordinates and only looks up the nearest
 * index on pointer move.
 */
export function ForecastChart({
  series,
  height = 300,
  showBand = true,
  interactive = true,
}: {
  series: ForecastSeries;
  height?: number;
  showBand?: boolean;
  interactive?: boolean;
}) {
  const geo = projectSeries(series.points, series.cutoff_index, {
    xTickCount: 6,
    // Static charts skip building the hover columns entirely, so a non
    // interactive chart sends no per-point data to the client at all.
    interactive,
  });

  return (
    <figure className="m-0">
      <ChartLegend showBand={showBand} />

      <div className="relative w-full" style={{ height }}>
        <div className="absolute top-2 right-2 bottom-7 left-14">
          <svg
            className="absolute inset-0 size-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${series.label}. Observed ${formatDate(
              series.historical_range.from
            )} to ${formatDate(series.historical_range.to)}, forecast ${formatDate(
              series.forecast_range.from
            )} to ${formatDate(series.forecast_range.to)}.`}
          >
            {/* Forecast region: a very subtle pale-purple wash, never neon. */}
            <rect
              x={geo.cutoffX}
              y={0}
              width={100 - geo.cutoffX}
              height={100}
              fill="var(--color-accent-lavender)"
              opacity={0.07}
            />

            {geo.yTicks.map((t) => (
              <line
                key={t.value}
                x1={0}
                x2={100}
                y1={t.y}
                y2={t.y}
                stroke="var(--color-series-grid)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {showBand && geo.bandPath && (
              <path d={geo.bandPath} fill="var(--color-series-band)" opacity={0.55} />
            )}

            <path
              d={geo.actualPath}
              fill="none"
              stroke="var(--color-series-actual)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            <path
              d={geo.forecastPath}
              fill="none"
              stroke="var(--color-series-forecast)"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            <line
              x1={geo.cutoffX}
              x2={geo.cutoffX}
              y1={0}
              y2={100}
              stroke="var(--color-brand-deep)"
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeOpacity={0.45}
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* NOW boundary label */}
          <span
            className="pointer-events-none absolute -top-2 z-[var(--z-content)] -translate-x-1/2 rounded-xs bg-surface-brand px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-ink-on-brand uppercase"
            style={{ left: `${geo.cutoffX}%` }}
          >
            Now
          </span>

          {geo.yTicks.map((t) => (
            <span
              key={t.value}
              className="absolute -left-14 w-12 -translate-y-1/2 text-right text-meta text-ink-tertiary"
              style={{ top: `${t.y}%` }}
              data-numeric
            >
              {formatCompact(t.value)}
            </span>
          ))}

          {geo.xTicks.map((t, i) => (
            <span
              key={`${t.label}-${i}`}
              className={`absolute top-full mt-1.5 text-meta whitespace-nowrap text-ink-tertiary ${
                t.x < 2 ? "" : t.x > 98 ? "-translate-x-full" : "-translate-x-1/2"
              } ${
                // Six date labels collide on a phone. Drop every other one
                // rather than shrinking the type below a readable size.
                i % 2 === 1 ? "hidden sm:inline" : ""
              }`}
              style={{ left: `${t.x}%` }}
            >
              {formatDateShort(t.label)}
            </span>
          ))}

          {geo.hover && <ChartHoverLayer data={geo.hover} unit={series.unit} />}
        </div>
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-meta text-ink-tertiary">
        <span>
          Observed {formatDate(series.historical_range.from)} –{" "}
          {formatDate(series.historical_range.to)}
        </span>
        <span>
          Forecast {formatDate(series.forecast_range.from)} –{" "}
          {formatDate(series.forecast_range.to)}
        </span>
      </figcaption>
    </figure>
  );
}

function ChartLegend({ showBand }: { showBand: boolean }) {
  return (
    <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-ink-secondary">
      <LegendItem color="var(--color-series-actual)" label="Actual demand" />
      <LegendItem color="var(--color-series-forecast)" label="Forecast" dashed />
      {showBand && (
        <li className="flex items-center gap-2">
          <span
            className="h-2.5 w-6 rounded-xs"
            style={{ backgroundColor: "var(--color-series-band)" }}
            aria-hidden="true"
          />
          80% interval
        </li>
      )}
    </ul>
  );
}

function LegendItem({
  color,
  label,
  dashed = false,
  thin = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  thin?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true">
        <line
          x1="0"
          y1="4"
          x2="24"
          y2="4"
          stroke={color}
          strokeWidth={thin ? 1.5 : 2}
          strokeDasharray={dashed ? "5 4" : undefined}
          strokeLinecap="round"
        />
      </svg>
      {label}
    </li>
  );
}
