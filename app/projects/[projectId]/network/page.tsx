import type { Metadata } from "next";
import { getOverview } from "@/app/dummy-data";
import { requireProjectAccess } from "@/auth/session";
import { BranchNetwork, type BranchNode } from "@/components/dashboard/branch-network";
import { ButtonLink } from "@/components/ui/button";
import { DataSource } from "@/components/ui/data-source";
import { ArrowRight } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/panel";
import { backend } from "@/lib/backend/client";
import { attempt } from "@/lib/backend/source";
import type { BackendBranches, BackendHierarchy } from "@/lib/backend/types";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Branch network" };

/**
 * The owner's map of the network; a manager's view of their own branch.
 *
 * One route, two products, the same way `team/page.tsx` works.
 * `requireProjectAccess` has already decided which branches this person may
 * see — an owner gets every branch in the project, a manager gets only what
 * they were granted — so this page never filters by role itself. It reads that
 * list and asks the forecasting service about each one.
 *
 * The network average is computed but handed to the component **only for an
 * owner**. It is an aggregate over branches a manager cannot open, and while
 * an average discloses no single branch, there is no reason a branch manager
 * needs a number describing branches they are not responsible for.
 *
 * Each branch is its own dataset in the forecasting service, so this is one
 * call per branch, in parallel. The service knows nothing about projects or
 * ownership and is not asked to — composing across branches is this layer's
 * job, and keeping it that way is why the forecasting service has no user
 * table to disagree with.
 */
export default async function NetworkPage({
  params,
}: PageProps<"/projects/[projectId]/network">) {
  const { projectId } = await params;
  const { project, branches, isOwner } = await requireProjectAccess(projectId);

  // Two shapes of the same idea, and this page has to read both.
  //
  // The auth layer normally splits an upload so each branch gets its own
  // forecasting dataset. But the forecasting service's own model is one dataset
  // per company with the branch as a *scope* (`?location=`), and a file pushed
  // straight into it keeps all branches together. When several branches point
  // at the same dataset that is what has happened, so the branch code becomes
  // the location filter instead of the dataset id doing the separating.
  //
  // Only when shared: for a genuinely split dataset the location column may not
  // spell the branch the way the auth layer does, and filtering on a value that
  // does not match would return an empty branch rather than a whole one.
  const perDataset = new Map<string, number>();
  for (const branch of branches) {
    if (branch.forecast_project_id) {
      perDataset.set(
        branch.forecast_project_id,
        (perDataset.get(branch.forecast_project_id) ?? 0) + 1,
      );
    }
  }

  // The shared dataset gets ONE call, not one per branch.
  //
  // Six parallel `/overview` reads of a 311-series dataset each recompute the
  // whole posture and then queue behind each other, and every one of them blew
  // the client's 15s timeout — so every node rendered "no forecast yet" while
  // the backend was answering correctly the whole time. `/branches` computes
  // all six at once and returns in about three seconds.
  const shared = [...perDataset.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const branchData = new Map<string, BackendBranches["branches"][number]>();
  let rollup: BackendHierarchy | null = null;
  let mergedDatasetId: string | null = null;

  for (const datasetId of shared) {
    const [insight, hierarchy] = await Promise.all([
      attempt(() => backend.getBranches(datasetId)),
      attempt(() => backend.getHierarchy(datasetId)),
    ]);
    if (!insight.ok) continue;
    for (const row of insight.data.branches) branchData.set(row.location_id, row);
    if (hierarchy.ok) {
      rollup = hierarchy.data;
      mergedDatasetId = datasetId;
    }
  }

  const results = await Promise.all(
    branches.map(async (branch): Promise<BranchNode> => {
      const base = {
        id: branch.id,
        code: branch.code,
        location: branch.location,
        forecastProjectId: branch.forecast_project_id,
        seriesCount: branch.product_count,
      };

      if (!branch.forecast_project_id) {
        return {
          ...base,
          attentionShare: null,
          coverageDays: null,
          bands: [],
          note: "This branch has no dataset in the forecasting service yet.",
        };
      }

      // The one-call path, when this project's branches share a dataset.
      const insight = branchData.get(branch.code);
      if (insight) {
        return {
          ...base,
          seriesCount: insight.series_count || branch.product_count,
          attentionShare:
            insight.series_count > 0
              ? insight.attention_count / insight.series_count
              : null,
          coverageDays: null,
          bands: [],
          note: null,
          unitsToOrder: insight.units_to_order,
          unitsFromTransfer: insight.units_coverable_by_transfer,
          medianWapePercent: insight.median_wape_percent,
          demandSharePercent: insight.demand_share_percent,
        };
      }

      if ((perDataset.get(branch.forecast_project_id) ?? 0) > 1) {
        // Shared dataset, but this branch code is not one of its locations.
        return {
          ...base,
          attentionShare: null,
          coverageDays: null,
          bands: [],
          note: `No branch "${branch.code}" in that dataset — the branch code has to match the location value in the file.`,
        };
      }

      const { data, live } = await getOverview(branch.forecast_project_id);

      // `live` is the whole point of the Sourced wrapper. Fixture numbers are
      // identical for every branch, so rendering them here would paint eight
      // nodes the same colour and call it a network map. A branch with no run
      // shows as not forecast, which is true.
      if (!live) {
        return {
          ...base,
          attentionShare: null,
          coverageDays: null,
          bands: [],
          note: "No forecast has run for this branch yet.",
        };
      }

      const posture = data.inventory;
      const attention = posture.bands
        .filter((b) => b.risk === "at_risk" || b.risk === "critical")
        .reduce((sum, b) => sum + b.series_count, 0);

      return {
        ...base,
        // Counted off the backend's own bands. Risk is classified in one place
        // (`view_models.classify_risk`) and this only adds up what came back.
        seriesCount: posture.total_series || branch.product_count,
        attentionShare:
          posture.total_series > 0 ? attention / posture.total_series : null,
        coverageDays: posture.median_coverage_days ?? null,
        bands: posture.bands,
        note: null,
      };
    }),
  );

  const withNumbers = results.filter((b) => b.attentionShare !== null);
  const networkAttentionShare =
    withNumbers.length > 0
      ? withNumbers.reduce((sum, b) => sum + (b.attentionShare ?? 0) * b.seriesCount, 0) /
        Math.max(1, withNumbers.reduce((sum, b) => sum + b.seriesCount, 0))
      : null;

  const missing = results.length - withNumbers.length;

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title={isOwner ? "Branch network" : "Your branch"}
        description={
          isOwner
            ? "Every branch in this project, and how much of each one's catalogue needs ordering attention right now."
            : "How much of your branch's catalogue needs ordering attention right now."
        }
        context={project.name}
      />

      {isOwner && rollup && (
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-md border border-border-subtle bg-surface-sunken/40 p-5">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <p className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
                Whole network, next 30 days
              </p>
              <p className="mt-1 text-metric leading-none font-bold text-brand-deep" data-numeric>
                {formatNumber(Math.round(rollup.network.horizon_total))} units
              </p>
              {rollup.coherence?.coherent && (
                // Worth stating, because the alternative is common and costly:
                // a reconciled or top-down total that no branch recognises, and
                // the argument that follows is what stops people using the tool.
                <p className="mt-1.5 text-meta text-ink-tertiary">
                  This is the sum of the branch forecasts, not a separate estimate —
                  they agree to within{" "}
                  {formatNumber(Math.max(1, Math.round(rollup.coherence.gap)))} unit
                  {Math.round(rollup.coherence.gap) === 1 ? "" : "s"}.
                </p>
              )}
            </div>
            {networkAttentionShare !== null && (
              <div>
                <p className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
                  Needs attention
                </p>
                <p className="mt-1 text-metric leading-none font-bold text-brand-deep" data-numeric>
                  {formatPercent(networkAttentionShare * 100)}
                </p>
                <p className="mt-1.5 text-meta text-ink-tertiary">
                  across {formatNumber(results.reduce((s, b) => s + b.seriesCount, 0))} products
                </p>
              </div>
            )}
          </div>
          {mergedDatasetId && (
            <ButtonLink href={`/projects/${mergedDatasetId}/dashboard`} variant="secondary" size="sm">
              Merged dashboard
              <ArrowRight size={15} />
            </ButtonLink>
          )}
        </div>
      )}

      {missing > 0 && (
        <div className="mt-6">
          <DataSource
            note={`${missing} of ${results.length} branch${
              results.length === 1 ? "" : "es"
            } ${missing === 1 ? "has" : "have"} no forecast yet — those nodes are drawn empty rather than estimated.`}
          />
        </div>
      )}

      <div className="mt-6 animate-enter [--enter-delay:80ms]">
        <BranchNetwork
          branches={results}
          isOwner={isOwner}
          networkAttentionShare={networkAttentionShare}
        />
      </div>
    </main>
  );
}
