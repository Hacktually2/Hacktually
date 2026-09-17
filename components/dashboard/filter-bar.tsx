"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { FilterOption } from "@/app/dummy-data/types";
import { X } from "@/components/ui/icons";

/**
 * Filter bar (design.md §41, §42, frontend_user_flow.md §53).
 *
 * Filters live in the URL, so a filtered view is shareable, survives refresh,
 * and a drill-down can be navigated back to without losing context. Changing a
 * filter is a data read against stored results — it never re-runs a forecast.
 *
 * The bar is a glass control layer, but each control is a plain surface: glass
 * on glass would flatten the hierarchy.
 */
export interface FilterSpec {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  /** Value that counts as "no filter", for the clear affordance. */
  neutral: string;
}

export function FilterBar({ filters }: { filters: FilterSpec[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (key: string, value: string, neutral: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === neutral) next.delete(key);
      else next.set(key, value);
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
    },
    [pathname, router, searchParams]
  );

  const activeCount = filters.filter((f) => f.value !== f.neutral).length;

  return (
    <div
      className="glass-control sticky top-[6.5rem] z-[var(--z-sticky)] flex flex-wrap items-end gap-3 rounded-md px-4 py-3"
      data-pending={pending || undefined}
    >
      {filters.map((filter) => (
        <div key={filter.key} className="min-w-0">
          <label
            htmlFor={`filter-${filter.key}`}
            className="mb-1 block text-meta font-medium text-ink-tertiary"
          >
            {filter.label}
          </label>
          <select
            id={`filter-${filter.key}`}
            value={filter.value}
            onChange={(e) => apply(filter.key, e.target.value, filter.neutral)}
            className={`h-9 max-w-56 min-w-40 rounded-sm border px-2.5 text-body-sm font-semibold focus:outline-none ${
              filter.value === filter.neutral
                ? "border-border-default bg-surface-card text-ink"
                : "border-brand-deep/25 bg-brand-pale text-brand-deep"
            }`}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace(pathname))}
          className="mb-0.5 flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-body-sm font-semibold text-brand-blue-ink hover:bg-brand-blue-soft"
        >
          <X size={14} />
          Clear {activeCount} {activeCount === 1 ? "filter" : "filters"}
        </button>
      )}

      <span
        aria-live="polite"
        className={`mb-2 ml-auto text-meta text-ink-tertiary transition-opacity duration-(--duration-fast) ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      >
        Updating…
      </span>
    </div>
  );
}
