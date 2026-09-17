/**
 * Display formatting only (design.md §63, §85).
 *
 * This is presentation, not business logic: every value arrives from the
 * backend already computed. Locales are pinned so server and client render
 * identical strings and hydration never mismatches.
 */

const LOCALE = "en-GB";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 84200 -> "84,200" */
export function formatNumber(value: number): string {
  return integer.format(value);
}

/** 12.83 -> "12.8%"  ·  sign is forced when the direction matters. */
export function formatPercent(value: number, signed = false): string {
  const body = `${oneDecimal.format(Math.abs(value))}%`;
  if (!signed) return body;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${body}`;
}

/**
 * 4862400000 -> "Rp 4.86B"  (design.md §30 — scale must be explicit)
 * Values under a million keep full precision so small numbers stay exact.
 */
export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${oneDecimal.format(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}Rp ${oneDecimal.format(abs / 1_000_000)}M`;
  return `${sign}Rp ${integer.format(abs)}`;
}

/** Compact axis labels: 58204 -> "58.2k" */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${oneDecimal.format(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${oneDecimal.format(value / 1_000)}k`;
  return integer.format(value);
}

/**
 * Months are spelled out here rather than via Intl because ICU renders
 * September as "Sept" in en-GB, and design.md §85 fixes the form as
 * "17 Sep 2026". A fixed table also cannot drift between ICU versions.
 */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-09-17" -> "17 Sep 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Short axis form: "2026-09-17" -> "17 Sep" */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-09-17T13:42:00+07:00" -> "17 Sep 2026, 13:42" (Jakarta time) */
export function formatDateTime(iso: string): string {
  // Shift the instant into Jakarta, then read it with the UTC getters so the
  // month table above applies and the result is identical on server and client.
  const jakarta = new Date(
    new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Jakarta" }) + " UTC"
  );
  const hh = String(jakarta.getUTCHours()).padStart(2, "0");
  const mm = String(jakarta.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(jakarta.toISOString())}, ${hh}:${mm}`;
}

/** 8 -> "8 days"  ·  null -> "—" */
export function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${integer.format(value)} ${value === 1 ? "day" : "days"}`;
}

/** Applies the unit a backend metric declares. */
export function formatByUnit(
  value: number,
  unit: "units" | "idr" | "count" | "percent"
): string {
  switch (unit) {
    case "idr":
      return formatCurrency(value);
    case "percent":
      return formatPercent(value);
    case "units":
    case "count":
    default:
      return formatNumber(value);
  }
}

/** Suffix rendered beneath a metric value, never inline with it (design.md §30). */
export function unitLabel(
  unit: "units" | "idr" | "count" | "percent",
  value: number
): string | null {
  switch (unit) {
    case "units":
      return "units";
    case "count":
      return value === 1 ? "SKU" : "SKUs";
    default:
      return null;
  }
}
