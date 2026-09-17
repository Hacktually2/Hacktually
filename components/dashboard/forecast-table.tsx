"use client";

import { memo, useMemo, useState } from "react";
import type { ForecastRow } from "@/app/dummy-data/types";
import { ChevronUpDown } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * Forecast detail (frontend_user_flow.md §27).
 *
 * Charts show shape; planners need the numbers. Sorting is local because it is
 * presentation, not analysis — the values themselves come from the backend
 * untouched.
 *
 * Rows are memoised and sorting is a single useMemo, so changing sort order
 * re-renders the header and the reordered rows only.
 */
type SortKey = "date" | "forecast" | "item_name";

export function ForecastTable({ rows }: { rows: ForecastRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "date",
    desc: false,
  });

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sort.desc ? -1 : 1;
      if (sort.key === "forecast") return (a.forecast - b.forecast) * dir;
      if (sort.key === "item_name") return a.item_name.localeCompare(b.item_name) * dir;
      return a.date.localeCompare(b.date) * dir;
    });
    return copy;
  }, [rows, sort]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No forecast rows for these filters"
        description="No series match the current product and location selection. Clear a filter to widen the result."
      />
    );
  }

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "forecast" }));

  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left">
        <thead className="sticky top-0 z-[var(--z-content)] bg-surface-card">
          <tr className="border-b border-border-default">
            <SortHeader label="Date" active={sort} sortKey="date" onClick={toggle} />
            <SortHeader label="Product" active={sort} sortKey="item_name" onClick={toggle} />
            <Th>Location</Th>
            <SortHeader
              label="Forecast"
              active={sort}
              sortKey="forecast"
              onClick={toggle}
              numeric
            />
            <Th numeric>80% interval</Th>
            <Th>Model</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <Row key={`${row.date}-${row.series_id}`} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Row = memo(function Row({ row }: { row: ForecastRow }) {
  return (
    <tr className="border-b border-border-subtle transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft">
      <td className="px-3 py-2.5 text-body-sm text-ink" data-numeric>
        {formatDate(row.date)}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-body-sm font-medium text-ink">{row.item_name}</span>
        <code className="ml-2 text-meta text-ink-tertiary">
          {row.series_id.split("__")[0]}
        </code>
      </td>
      <td className="px-3 py-2.5 text-body-sm text-ink-secondary">{row.location}</td>
      <td className="px-3 py-2.5 text-right text-body-sm font-semibold text-ink" data-numeric>
        {formatNumber(row.forecast)}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink-secondary" data-numeric>
        {formatNumber(row.lower)} – {formatNumber(row.upper)}
      </td>
      <td className="px-3 py-2.5 text-meta text-ink-tertiary">{row.model}</td>
    </tr>
  );
});

function Th({ children, numeric }: { children: React.ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase ${
        numeric ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  onClick,
  numeric,
}: {
  label: string;
  sortKey: SortKey;
  active: { key: SortKey; desc: boolean };
  onClick: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const isActive = active.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (active.desc ? "descending" : "ascending") : "none"}
      className={`px-3 py-2.5 ${numeric ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 text-meta font-semibold tracking-wide uppercase ${
          isActive ? "text-brand-deep" : "text-ink-tertiary hover:text-brand-deep"
        }`}
      >
        {label}
        <ChevronUpDown size={12} />
      </button>
    </th>
  );
}
