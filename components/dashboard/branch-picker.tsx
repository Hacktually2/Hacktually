import Link from "next/link";
import { Layers } from "@/components/ui/icons";

/**
 * Which branch this dashboard is showing.
 *
 * Only appears for someone who holds more than one branch but not the whole
 * network. The forecasting service scopes one branch per request, so a regional
 * manager reads their branches one at a time — and that is a feature of the
 * boundary, not a workaround: the branches they are not looking at are never in
 * the response.
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
}: {
  /** Dashboard path for the current tab, e.g. /projects/x/dashboard/demand */
  base: string;
  options: string[];
  active: string | null;
  /** The other query params in play, so switching branch keeps the filters. */
  search: Record<string, string | string[] | undefined>;
}) {
  if (options.length < 2) return null;

  const hrefFor = (branch: string) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (key === "branch") continue;
      const single = Array.isArray(value) ? value[0] : value;
      if (single) query.set(key, single);
    }
    query.set("branch", branch);
    return `${base}?${query}`;
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-ink-tertiary">
        <Layers size={13} />
        Branch
      </span>
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
