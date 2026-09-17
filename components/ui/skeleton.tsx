/**
 * Skeletons.
 *
 * Each one mirrors the real component's layout rather than being a generic grey
 * box, so nothing shifts when the data lands (design.md §57). They are server
 * components with no state: a skeleton that costs JavaScript to show has missed
 * the point.
 *
 * The whole tree is hidden from assistive tech and announced once by the region
 * that owns it. A screen reader should hear "loading", not forty empty boxes.
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  /** For sizes that are not on the spacing scale, such as a chart's height. */
  style?: React.CSSProperties;
}) {
  return <span className={`skeleton block ${className}`} style={style} />;
}

/** Wraps a loading view: hides the placeholder shapes, announces the wait. */
export function SkeletonRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- fragments */

export function SkeletonPageHeader() {
  return (
    <div>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2.5 h-4 w-96 max-w-full" />
      <Skeleton className="mt-2 h-3 w-48" />
    </div>
  );
}

/** Matches KpiCard: accent rule, label, metric, context, comparison. */
export function SkeletonKpiCard() {
  return (
    <div className="surface-card p-5">
      <Skeleton className="h-1 w-8 rounded-full" />
      <Skeleton className="mt-3 h-3.5 w-28" />
      <Skeleton className="mt-2.5 h-7 w-32" />
      <Skeleton className="mt-2.5 h-3 w-36" />
      <Skeleton className="mt-3 h-3 w-24" />
    </div>
  );
}

/**
 * Matches a chart panel. The plot is a single block rather than fake bars or a
 * fake line: inventing a shape the data has not produced yet suggests a trend
 * that may turn out to be wrong.
 */
export function SkeletonChartPanel({ height = 320 }: { height?: number }) {
  return (
    <div className="surface-card p-5">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      <div className="mt-5 flex gap-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="mt-4 flex gap-3">
        <div className="flex w-10 shrink-0 flex-col justify-between py-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-2.5 w-full" />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-sm" style={{ height }} />
      </div>
      <Skeleton className="mt-3 h-3 w-80 max-w-full" />
    </div>
  );
}

export function SkeletonTablePanel({
  rows = 8,
  columns = 6,
  withToolbar = true,
}: {
  rows?: number;
  columns?: number;
  withToolbar?: boolean;
}) {
  return (
    <div className="surface-card">
      <div className="px-5 pt-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </div>

      {withToolbar && (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <Skeleton className="h-9 w-full max-w-xs rounded-sm" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}

      <div className="border-t border-border-subtle">
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b border-border-subtle px-5 py-3"
          >
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton
                key={c}
                // The first column is the product name and reads wider than the
                // numeric columns that follow it.
                className={`h-3.5 ${c === 0 ? "w-44 shrink-0" : "flex-1"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches the ranked priority list and other icon + text + value rows. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="surface-card">
      <div className="px-5 pt-4 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="border-t border-border-subtle">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex gap-4 border-b border-border-subtle px-5 py-4">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-36" />
              <Skeleton className="mt-2 h-3 w-full max-w-md" />
            </div>
            <div className="shrink-0 text-right">
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="mt-2 ml-auto h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches PostureStrip: headline, the proportion bar, the filter chips. */
export function SkeletonPostureStrip() {
  return (
    <div className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-0">
          <Skeleton className="h-6 w-72 max-w-full" />
          <Skeleton className="mt-2.5 h-4 w-96 max-w-full" />
        </div>
        <div className="shrink-0 border-l border-border-subtle pl-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-28" />
          <Skeleton className="mt-2.5 h-3 w-20" />
        </div>
      </div>
      <Skeleton className="mt-5 h-2 w-full rounded-xs" />
      <div className="mt-4 flex flex-wrap gap-2">
        {[128, 96, 88, 104].map((w) => (
          <Skeleton key={w} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

/** Matches a generic content panel: heading, description, body. */
export function SkeletonPanel({ bodyLines = 4 }: { bodyLines?: number }) {
  return (
    <div className="surface-card p-5">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="mt-2 h-3 w-64 max-w-full" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: bodyLines }, (_, i) => (
          <Skeleton
            key={i}
            className={`h-3.5 ${i === bodyLines - 1 ? "w-2/3" : "w-full"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Matches a project card on the chooser. */
export function SkeletonProjectCard() {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-3 w-40" />
      <div className="mt-4 grid grid-cols-3 gap-3 border-y border-border-subtle py-3">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="mt-2 h-4 w-10" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-2.5 h-3.5 w-28" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>
    </div>
  );
}
