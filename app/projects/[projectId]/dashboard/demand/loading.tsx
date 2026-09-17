import {
  SkeletonChartPanel,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonRegion,
  SkeletonTablePanel,
  Skeleton,
} from "@/components/ui/skeleton";

/** Demand & Sales, loading. Filter bar, main chart, the three panels, table. */
export default function DemandLoading() {
  return (
    <main className="layout-shell flex-1 py-8">
      <SkeletonRegion label="Loading demand and sales">
        <SkeletonPageHeader />

        {/* Filter bar: four controls and their labels. */}
        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-1.5 h-9 w-44 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_1fr] xl:items-start">
          <SkeletonChartPanel height={340} />
          <div className="space-y-5">
            <SkeletonPanel bodyLines={5} />
            <SkeletonPanel bodyLines={3} />
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr]">
          <SkeletonPanel bodyLines={6} />
          <SkeletonPanel bodyLines={6} />
          <SkeletonPanel bodyLines={6} />
        </div>

        <div className="mt-5">
          <SkeletonTablePanel rows={6} columns={6} withToolbar={false} />
        </div>
      </SkeletonRegion>
    </main>
  );
}
