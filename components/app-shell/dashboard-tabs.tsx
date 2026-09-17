"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

/**
 * The three persistent dashboard destinations (design.md §32).
 * Forecasting is not a tab — it is the dominant workflow inside Demand & Sales.
 *
 * Client only because the active tab depends on the route segment. It reads one
 * segment string; no data crosses the boundary.
 */
const TABS = [
  { segment: null, href: "", label: "Overview" },
  { segment: "demand", href: "/demand", label: "Demand & Sales" },
  { segment: "supply-chain", href: "/supply-chain", label: "Supply Chain" },
] as const;

export function DashboardTabs({ base }: { base: string }) {
  const active = useSelectedLayoutSegment();

  return (
    // The three labels are wider than a small phone. Rather than abbreviating
    // them, the bar scrolls: min-w-0 lets it shrink inside the flex row, and the
    // negative margin lets it bleed into the layout gutter so the last tab is
    // not visually cut off mid-word.
    <nav
      className="-mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1"
      aria-label="Dashboard sections"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.segment;
        return (
          <Link
            key={tab.label}
            href={`${base}${tab.href}`}
            aria-current={isActive ? "page" : undefined}
            className={`relative shrink-0 rounded-sm px-3 py-2 text-body-sm font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) ease-(--ease-standard) ${
              isActive
                ? "bg-brand-pale text-brand-deep"
                : "text-ink-secondary hover:bg-brand-pale-soft hover:text-brand-deep"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
