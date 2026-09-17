import {
  SkeletonChartPanel,
  SkeletonKpiCard,
  SkeletonList,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonRegion,
} from "@/components/ui/skeleton";

/**
 * Overview, loading.
 *
 * Mirrors the real page section for section, so when the data lands the numbers
 * fill the boxes already on screen rather than pushing the layout around. The
 * project bar above comes from the layout and stays put throughout.
 */
export default function OverviewLoading() {
  return (
    <main className="layout-shell flex-1 py-8">
      <SkeletonRegion label="Loading the overview">
        <SkeletonPageHeader />

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonKpiCard key={i} />
          ))}
        </section>

        <div className="mt-5">
          <SkeletonChartPanel height={320} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <SkeletonPanel bodyLines={6} />
          <SkeletonList rows={5} />
        </div>
      </SkeletonRegion>
    </main>
  );
}
