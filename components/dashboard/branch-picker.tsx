import Link from "next/link";
import { Layers } from "@/components/ui/icons";

/**
 * Which branch this dashboard is showing.
 *
 * Two audiences, because "scoped to one branch" happens two ways. A manager
 * holding several branches gets the switcher: the forecasting service scopes
 * one branch per request, so they read their branches one at a time — a feature
 * of the boundary, not a workaround, since the branches they are not looking at
 * are never in the response. An owner has no such restriction, but can still
 * focus a single branch from the network map, and then needs the opposite
 * affordance: a reminder that these numbers are one kota rather than the
 * network, and one click back out.
 *
 * Links rather than a select, so the choice is in the URL, survives a reload
 * and can be shared. The server re-checks it against what the person holds, so
 * editing it by hand narrows or falls back — never widens.
 */
export function BranchPicker({
  base,
  options,
  active,
  search,
  restricted = true,
}: {
  /** Dashboard path for the current tab, e.g. /projects/x/dashboard/demand */
  base: string;
  options: string[];
  active: string | null;
  /** The other query params in play, so switching branch keeps the filters. */
  search: Record<string, string | string[] | undefined>;
  /**
   * False for someone who may see the whole network. Only they are offered the
   * way out — for a manager the whole network is not a place they can go, and
   * a link that silently snaps back to their own branch is worse than no link.
   */
  restricted?: boolean;
}) {
  const hrefFor = (branch: string | null) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (key === "branch") continue;
      const single = Array.isArray(value) ? value[0] : value;
      if (single) query.set(key, single);
    }
    if (branch) query.set("branch", branch);
    const suffix = query.toString();
    return suffix ? `${base}?${suffix}` : base;
  };

  const label = (
    <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-ink-tertiary">
      <Layers size={13} />
      Branch
    </span>
  );

  // An owner who clicked into one kota. Nothing to switch between — they can
  // see everything — so this states the scope and offers the way back.
  if (options.length < 2) {
    if (!active || restricted) return null;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {label}
        <span className="rounded-sm border border-brand-blue bg-brand-pale px-2.5 py-1 text-meta font-semibold text-brand-deep">
          {active}
        </span>
        <Link
          href={hrefFor(null)}
          className="text-meta font-semibold text-brand-blue-ink transition-colors duration-(--duration-fast) hover:text-brand-blue-hover"
        >
          View whole network
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {label}
      <div
        className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1"
        role="group"
        aria-label="Choose a branch"
      >
        {options.map((branch) => {
          const isActive = branch === active;
          return (
            <Link
              key={branch}
              href={hrefFor(branch)}
              aria-current={isActive ? "true" : undefined}
              className={`shrink-0 rounded-sm border px-2.5 py-1 text-meta font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) ${
                isActive
                  ? "border-brand-blue bg-brand-pale text-brand-deep"
                  : "border-border-subtle text-ink-secondary hover:border-brand-blue/40 hover:text-brand-deep"
              }`}
            >
              {branch}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
