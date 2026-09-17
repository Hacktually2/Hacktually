import {
  Skeleton,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonPostureStrip,
  SkeletonRegion,
  SkeletonTablePanel,
} from "@/components/ui/skeleton";

/** Supply Chain, loading. Posture strip, filters, the table, value, scenario. */
export default function SupplyChainLoading() {
  return (
    <main className="layout-shell flex-1 py-8">
      <SkeletonRegion label="Loading supply chain">
        <SkeletonPageHeader />

        <div className="mt-7">
          <SkeletonPostureStrip />
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-1.5 h-9 w-40 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="mt-5">
          {/* The densest table in the product, so it gets the most rows: an
              obviously short placeholder under a long table makes the page
              jump when the real rows arrive. */}
          <SkeletonTablePanel rows={10} columns={6} />
        </div>

        <div className="mt-5">
          <SkeletonPanel bodyLines={4} />
        </div>

        {/* The scenario section, so the placeholder reflects how long this page
            actually is and the scrollbar does not jump when it arrives. */}
        <div className="mt-10">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2.5 h-4 w-96 max-w-full" />
          <div className="mt-5 surface-card p-5">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
              <div className="space-y-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="mt-2 h-8 w-full rounded-sm" />
                  </div>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-md border border-border-subtle p-4">
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="mt-2.5 h-7 w-32" />
                    <Skeleton className="mt-2.5 h-3 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SkeletonRegion>
    </main>
  );
}
