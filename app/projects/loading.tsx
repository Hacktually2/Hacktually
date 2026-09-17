import { Skeleton, SkeletonProjectCard, SkeletonRegion } from "@/components/ui/skeleton";

/** Project chooser, loading. */
export default function ProjectsLoading() {
  return (
    <main className="layout-shell flex-1 py-10">
      <SkeletonRegion label="Loading projects">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Skeleton className="h-7 w-56" />
            <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-sm" />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonProjectCard key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </main>
  );
}
