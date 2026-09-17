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

export interface ProjectedPoint {
  /** 0–100 across the plot. */
  x: number;
  t: string;
  actual: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
  sales: number | null;
  /** 0–100 down the plot, already flipped so 0 is the top. */
  yActual: number | null;
  yForecast: number | null;
  ySales: number | null;
}

export interface ChartGeometry {
  points: ProjectedPoint[];
  /** Polyline path for the observed portion. */
  actualPath: string;
  /** Polyline path for the predicted portion. */
  forecastPath: string;
  /** Optional recorded-sales line. */
  salesPath: string | null;
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
  options: { xTickCount?: number; yTickCount?: number; includeSales?: boolean } = {}
): ChartGeometry {
  const { xTickCount = 6, yTickCount = 5, includeSales = false } = options;
  const n = points.length;

  let peak = 0;
  for (const p of points) {
    if (p.actual !== null && p.actual > peak) peak = p.actual;
    if (p.upper !== null && p.upper > peak) peak = p.upper;
    if (p.forecast !== null && p.forecast > peak) peak = p.forecast;
    if (includeSales && p.sales != null && p.sales > peak) peak = p.sales;
  }

  // Round the top of the axis up to a tick boundary so labels read cleanly.
  const step = niceStep(peak, yTickCount);
  const max = step * yTickCount;

  // Demand is a volume, so the axis is anchored at zero rather than cropped.
  const toY = (v: number) => 100 - (v / max) * 100;
  const toX = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100);

  const projected: ProjectedPoint[] = points.map((p, i) => ({
    x: toX(i),
    t: p.t,
    actual: p.actual,
    forecast: p.forecast,
    lower: p.lower,
    upper: p.upper,
    sales: p.sales ?? null,
    yActual: p.actual === null ? null : toY(p.actual),
    yForecast: p.forecast === null ? null : toY(p.forecast),
    ySales: p.sales == null ? null : toY(p.sales),
  }));

  const line = (key: "yActual" | "yForecast" | "ySales") => {
    const segments: string[] = [];
    let open = false;
    for (const p of projected) {
      const y = p[key];
      if (y === null) {
        open = false;
        continue;
      }
      segments.push(`${open ? "L" : "M"}${p.x.toFixed(3)},${y.toFixed(3)}`);
      open = true;
    }
    return segments.join(" ");
  };

  // Uncertainty band: forward along the upper quantile, back along the lower.
  const withBand = projected.filter((p) => p.lower !== null && p.upper !== null);
  let bandPath: string | null = null;
  if (withBand.length > 1) {
    const top = withBand
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${toY(p.upper!).toFixed(3)}`)
      .join(" ");
    const bottom = [...withBand]
      .reverse()
      .map((p) => `L${p.x.toFixed(3)},${toY(p.lower!).toFixed(3)}`)
      .join(" ");
    bandPath = `${top} ${bottom} Z`;
  }

  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => ({
    value: step * i,
    y: 100 - (i / yTickCount) * 100,
  }));

  const tickEvery = Math.max(1, Math.round((n - 1) / (xTickCount - 1)));
  const xTicks: { label: string; x: number }[] = [];
  for (let i = 0; i < n; i += tickEvery) {
    xTicks.push({ label: points[i].t, x: toX(i) });
  }
  // Always anchor the right edge so the forecast end date is visible.
  if (xTicks[xTicks.length - 1]?.x < 99) {
    xTicks.push({ label: points[n - 1].t, x: 100 });
  }

  return {
    points: projected,
    actualPath: line("yActual"),
    forecastPath: line("yForecast"),
    salesPath: includeSales ? line("ySales") || null : null,
    bandPath,
    cutoffX: toX(cutoffIndex),
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
