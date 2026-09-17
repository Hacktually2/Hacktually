import type { SeriesPoint } from "@/app/dummy-data/types";

/**
 * Chart geometry — pixel projection only.
 *
 * This maps already-computed backend values onto a drawing surface. It derives
 * no business meaning: no risk, no coverage, no aggregation. Everything here
 * runs once on the server; the client receives the projected result.
 *
 * The drawing space is normalised to 0–100 on both axes so the SVG can use
 * preserveAspectRatio="none" and stay responsive at any width, while strokes
 * keep their true thickness via vector-effect="non-scaling-stroke".
 */

/**
 * Hover data, stored columnar rather than as an array of points.
 *
 * This is the one structure that crosses to the client, and as an array of
 * objects every key name was re-serialised per point: at 150 points that is
 * ~9kb of the strings "forecast", "yActual" and friends repeated. One array per
 * field costs each key once.
 *
 * `x` is not stored at all. The axis is uniformly spaced, so position is
 * `index / (count - 1) * 100` and the client derives it.
 */
export interface HoverData {
  count: number;
  t: string[];
  actual: (number | null)[];
  forecast: (number | null)[];
  lower: (number | null)[];
  upper: (number | null)[];
  yActual: (number | null)[];
  yForecast: (number | null)[];
}

export interface ChartGeometry {
  /** Only built when the chart is interactive; nothing else consumes it. */
  hover: HoverData | null;
  /** Polyline path for the observed portion. */
  actualPath: string;
  /** Polyline path for the predicted portion. */
  forecastPath: string;
  /** Closed area between the upper and lower quantiles. */
  bandPath: string | null;
  /** 0–100 position of the boundary between observed and predicted. */
  cutoffX: number;
  yTicks: { value: number; y: number }[];
  xTicks: { label: string; x: number }[];
  max: number;
}

/**
 * Smallest readable tick step whose top gridline still clears the peak.
 *
 * A coarse 1/2/5 ladder leaves dead space — a series peaking at 2,400 would be
 * drawn against a 4,000 axis, wasting a third of the plot and flattening the
 * shape. Widening the ladder keeps the data filling the panel.
 */
const TICK_MULTIPLES = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceStep(peak: number, ticks: number): number {
  if (peak <= 0) return 1;
  const raw = peak / ticks;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of TICK_MULTIPLES) {
    const step = m * power;
    if (step * ticks >= peak) return step;
  }
  return 10 * power;
}

export function projectSeries(
  points: SeriesPoint[],
  cutoffIndex: number,
  options: {
    xTickCount?: number;
    yTickCount?: number;
    /** Build the hover columns. Skipped for static charts, which never use them. */
    interactive?: boolean;
  } = {}
): ChartGeometry {
  const {
    xTickCount = 6,
    yTickCount = 5,
    interactive = false,
  } = options;
  const n = points.length;

  let peak = 0;
  for (const p of points) {
    if (p.actual !== null && p.actual > peak) peak = p.actual;
    if (p.upper !== null && p.upper > peak) peak = p.upper;
    if (p.forecast !== null && p.forecast > peak) peak = p.forecast;
  }

  // Round the top of the axis up to a tick boundary so labels read cleanly.
  const step = niceStep(peak, yTickCount);
  const max = step * yTickCount;

  // Demand is a volume, so the axis is anchored at zero rather than cropped.
  const toY = (v: number) => 100 - (v / max) * 100;
  const toX = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100);
  // Two decimals is finer than a physical pixel at any realistic chart width,
  // and keeps each number short in the payload that crosses to the client.
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // One pass builds every path and, when asked, the hover columns. The previous
  // version materialised an intermediate array of point objects and then walked
  // it three more times.
  const hover: HoverData | null = interactive
    ? {
        count: n,
        t: [],
        actual: [],
        forecast: [],
        lower: [],
        upper: [],
        yActual: [],
        yForecast: [],
      }
    : null;

  const actualSeg: string[] = [];
  const forecastSeg: string[] = [];
  let actualOpen = false;
  let forecastOpen = false;
  const bandTop: string[] = [];
  const bandBottom: string[] = [];

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const x = toX(i);
    const xs = x.toFixed(3);

    if (p.actual === null) {
      actualOpen = false;
    } else {
      actualSeg.push(`${actualOpen ? "L" : "M"}${xs},${toY(p.actual).toFixed(3)}`);
      actualOpen = true;
    }

    if (p.forecast === null) {
      forecastOpen = false;
    } else {
      forecastSeg.push(`${forecastOpen ? "L" : "M"}${xs},${toY(p.forecast).toFixed(3)}`);
      forecastOpen = true;
    }

    if (p.lower !== null && p.upper !== null) {
      bandTop.push(`${bandTop.length === 0 ? "M" : "L"}${xs},${toY(p.upper).toFixed(3)}`);
      // Collected forward, emitted in reverse to close the polygon.
      bandBottom.push(`L${xs},${toY(p.lower).toFixed(3)}`);
    }

    if (hover) {
      hover.t.push(p.t);
      hover.actual.push(p.actual);
      hover.forecast.push(p.forecast);
      hover.lower.push(p.lower);
      hover.upper.push(p.upper);
      hover.yActual.push(p.actual === null ? null : r2(toY(p.actual)));
      hover.yForecast.push(p.forecast === null ? null : r2(toY(p.forecast)));
    }
  }

  const bandPath =
    bandTop.length > 1
      ? `${bandTop.join(" ")} ${bandBottom.reverse().join(" ")} Z`
      : null;

  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => ({
    value: step * i,
    y: 100 - (i / yTickCount) * 100,
  }));

  const tickEvery = Math.max(1, Math.round((n - 1) / (xTickCount - 1)));
  const xTicks: { label: string; x: number }[] = [];
  for (let i = 0; i < n; i += tickEvery) {
    xTicks.push({ label: points[i].t, x: r2(toX(i)) });
  }
  // Always anchor the right edge so the forecast end date is visible.
  if (xTicks[xTicks.length - 1]?.x < 99) {
    xTicks.push({ label: points[n - 1].t, x: 100 });
  }

  return {
    hover,
    actualPath: actualSeg.join(" "),
    forecastPath: forecastSeg.join(" "),
    bandPath,
    cutoffX: r2(toX(cutoffIndex)),
    yTicks,
    xTicks,
    max,
  };
}

/** Normalises a short numeric run into a 0–100 polyline (sparklines, cells). */
export function sparklinePath(values: number[], height = 100): string {
  if (values.length < 2) return "";
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
