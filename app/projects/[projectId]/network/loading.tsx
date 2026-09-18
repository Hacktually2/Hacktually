import {
  SkeletonChartPanel,
  SkeletonPageHeader,
  SkeletonPanel,
  SkeletonRegion,
} from "@/components/ui/skeleton";

/**
 * Branch network, loading.
 *
 * This route is the slowest in the app and was the only dashboard route without
 * a skeleton, so clicking "Branch network" sat on the previous page with no
 * acknowledgement until every branch had answered. The work is unchanged; what
 * changes is that the navigation commits immediately and the shell streams in
 * while the branches are still being read.
 *
 * Laid out as the real page is — chart left, detail panel right — so the map
 * appears in the frame already on screen instead of displacing it.
 */
export default function NetworkLoading() {
  return (
    <main className="layout-shell flex-1 py-10">
      <SkeletonRegion label="Loading the branch network">
        <SkeletonPageHeader />

        <div className="mt-8 grid gap-0 lg:grid-cols-[1fr_minmax(0,320px)]">
          <SkeletonChartPanel height={380} />
          <SkeletonPanel bodyLines={7} />
        </div>
      </SkeletonRegion>
    </main>
  );
}
