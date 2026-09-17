"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { InventoryRow } from "@/app/dummy-data/types";
import { MiniBars } from "@/components/charts/bars";
import { ChevronUpDown, Search, X } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/panel";
import { DEMAND_COLOR, DemandClassBadge, RiskBadge, RiskDot } from "@/components/ui/status";
import { formatDays, formatNumber, formatPercent } from "@/lib/format";

/**
 * Inventory vs demand (frontend_user_flow.md §31, §35; design.md §47–§51).
 *
 * The operational workspace: table-first, built for scanning many rows and
 * finding exceptions. Search and sort are presentation and run locally; risk,
 * coverage and recommended quantities are backend values rendered as given.
 *
 * Performance: one deferred search value, one memoised sort pass, and memoised
 * rows. Typing does not re-render the table body until the deferred value
 * settles, and selecting a row re-renders two rows, not the table.
 */
type SortKey = "risk" | "recommended_qty" | "coverage_days" | "item_name";

const RISK_ORDER = { critical: 0, at_risk: 1, watch: 2, healthy: 3 } as const;

export function InventoryWorkspace({ rows }: { rows: InventoryRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "risk",
    desc: false,
  });

  const selected = searchParams.get("series");

  const select = useCallback(
    (seriesId: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (seriesId) next.set("series", seriesId);
      else next.delete("series");
      const q = next.toString();
      // The selection lives in the URL so a drill-down from Overview lands on
      // the right row and Back returns to the filtered list.
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = needle
      ? rows.filter(
          (r) =>
            r.item_name.toLowerCase().includes(needle) ||
            r.item_id.toLowerCase().includes(needle) ||
            r.location.toLowerCase().includes(needle)
        )
      : rows;

    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "item_name":
          return a.item_name.localeCompare(b.item_name) * dir;
        case "recommended_qty":
          return (a.recommended_qty - b.recommended_qty) * dir;
        case "coverage_days":
          return (a.coverage_days - b.coverage_days) * dir;
        default:
          return (RISK_ORDER[a.risk] - RISK_ORDER[b.risk]) * dir;
      }
    });
  }, [rows, deferredQuery, sort]);

  const active = selected ? rows.find((r) => r.series_id === selected) : undefined;

  const toggle = (key: SortKey) =>
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "item_name" && key !== "risk" }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <label className="relative flex-1 md:max-w-xs">
          <span className="sr-only">Search products</span>
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="h-9 w-full rounded-sm border border-border-default bg-surface-card pr-3 pl-9 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
          />
        </label>
        <p className="text-meta text-ink-tertiary" aria-live="polite">
          {formatNumber(visible.length)} of {formatNumber(rows.length)} items
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No items match"
          description="No SKUs match the current search and filters. Clear the search or widen the status filter."
        />
      ) : (
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="w-full min-w-[62rem] border-collapse text-left">
            <thead className="sticky top-0 z-[var(--z-content)] bg-surface-card">
              <tr className="border-b border-border-default">
                <SortHeader label="Product" k="item_name" sort={sort} onClick={toggle} />
                <Th>Location</Th>
                <Th numeric>Current stock</Th>
                <Th numeric>Forecast demand</Th>
                {/* Cover against lead time is the comparison that drives the
                    status. Sorting it is the same ordering as sorting by days
                    until stockout, so no separate column is needed — the exact
                    projection is in the drawer. */}
                <SortHeader
                  label="Cover / lead time"
                  k="coverage_days"
                  sort={sort}
                  onClick={toggle}
                  numeric
                />
                <SortHeader label="Status" k="risk" sort={sort} onClick={toggle} />
                <SortHeader
                  label="Recommended"
                  k="recommended_qty"
                  sort={sort}
                  onClick={toggle}
                  numeric
                />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Row
                  key={row.series_id}
                  row={row}
                  selected={row.series_id === selected}
                  onSelect={select}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && <DetailDrawer row={active} onClose={() => select(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------- rows */

const Row = memo(function Row({
  row,
  selected,
  onSelect,
}: {
  row: InventoryRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(row.series_id)}
      aria-selected={selected}
      className={`cursor-pointer border-b border-border-subtle transition-colors duration-(--duration-fast) ${
        selected ? "bg-brand-pale" : "hover:bg-brand-pale-soft"
      }`}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <RiskDot risk={row.risk} />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-ink">{row.item_name}</p>
            <code className="text-meta text-ink-tertiary">{row.item_id}</code>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-body-sm text-ink-secondary">{row.location}</td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink" data-numeric>
        {formatNumber(row.current_stock)}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink" data-numeric>
        {formatNumber(row.forecast_demand)}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink" data-numeric>
        {row.coverage_days}d
        <span className="ml-1 text-meta text-ink-tertiary">/ {row.lead_time_days}d LT</span>
      </td>
      <td className="px-3 py-2.5">
        <RiskBadge risk={row.risk} label={row.risk_label} size="sm" />
      </td>
      <td className="px-3 py-2.5 text-right" data-numeric>
        {row.recommended_qty > 0 ? (
          <span className="text-body-sm font-bold text-brand-deep">
            {formatNumber(row.recommended_qty)}
          </span>
        ) : (
          <span className="text-body-sm text-ink-tertiary">—</span>
        )}
      </td>
    </tr>
  );
});

/* ----------------------------------------------------------------- drawer */

function DetailDrawer({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="animate-enter-backdrop fixed inset-0 z-[var(--z-drawer)] bg-brand-deep/15"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* A contextual functional surface, so glass is appropriate here — but the
          content inside stays on stable surfaces (design.md §51). */}
      <aside
        className="glass-overlay animate-enter-drawer fixed inset-y-0 right-0 z-[var(--z-drawer)] w-full max-w-md overflow-y-auto rounded-l-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`${row.item_name} detail`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-page font-bold text-brand-deep">{row.item_name}</h2>
            <p className="mt-1 text-body-sm text-ink-secondary">
              <code>{row.item_id}</code> · {row.location} · {row.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1.5 text-ink-secondary hover:bg-surface-card hover:text-ink"
            aria-label="Close detail"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RiskBadge risk={row.risk} label={row.risk_label} />
          <DemandClassBadge demandClass={row.demand_class} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-md bg-surface-card p-4">
          <Field label="Current stock">{formatNumber(row.current_stock)} units</Field>
          <Field label="Forecast demand" hint="Next 30 days">
            {formatNumber(row.forecast_demand)} units
          </Field>
          <Field label="Lead-time demand" hint={`Over ${row.lead_time_days} days`}>
            {formatNumber(row.lead_time_demand)} units
          </Field>
          <Field label="Safety stock">{formatNumber(row.safety_stock)} units</Field>
          {/* Cover and days-until-stockout are the same figure under a flat
              demand assumption, so only the decision-relevant one is shown
              here. Replenishment lead time is the number worth pairing it
              with — it is what makes the projection urgent or not. */}
          <Field label="Until projected stockout">{formatDays(row.days_until_stockout)}</Field>
          <Field label="Replenishment lead time">{formatDays(row.lead_time_days)}</Field>
        </dl>

        {/* The recommendation as a sum the planner can check line by line. */}
        <section className="mt-5 rounded-md bg-surface-card p-4">
          <h3 className="text-section font-semibold text-brand-deep">
            {row.explanation.total_label}
          </h3>
          {row.recommended_qty > 0 ? (
            <>
              <p className="mt-1 text-metric-lg leading-none font-bold text-brand-deep" data-numeric>
                {formatNumber(row.recommended_qty)}
                <span className="ml-2 text-body font-medium text-ink-tertiary">units</span>
              </p>
              <dl className="mt-4 border-t border-border-subtle pt-3">
                {row.explanation.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-4 py-1.5">
                    <dt className="text-body-sm text-ink-secondary">{line.label}</dt>
                    <dd className="text-body-sm font-medium text-ink" data-numeric>
                      {line.value < 0 ? "−" : line.kind === "adjust" ? "+" : ""}
                      {formatNumber(Math.abs(line.value))}
                    </dd>
                  </div>
                ))}
                <div className="mt-1 flex justify-between gap-4 border-t border-border-default pt-2.5">
                  <dt className="text-body-sm font-semibold text-brand-deep">
                    {row.explanation.total_label}
                  </dt>
                  <dd className="text-body font-bold text-brand-deep" data-numeric>
                    {formatNumber(row.explanation.total_value)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-meta text-ink-tertiary">
                Minimum order quantity {formatNumber(row.moq)} units · lead time{" "}
                {row.lead_time_days} days.
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-body text-ink-secondary">
              Stock covers lead-time demand plus the safety buffer. No order is required this
              cycle.
            </p>
          )}
        </section>

        <section className="mt-5 rounded-md bg-surface-card p-4">
          <h3 className="text-body font-semibold text-brand-deep">Recent demand</h3>
          <p className="mt-0.5 text-meta text-ink-tertiary">Last 12 periods</p>
          <div className="mt-3">
            <MiniBars
              values={row.recent_demand}
              color={DEMAND_COLOR[row.demand_class]}
            />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border-subtle pt-3">
            <Field label="Model">{row.model}</Field>
            <Field label="WAPE">{formatPercent(row.wape_percent)}</Field>
          </dl>
          <p className="mt-3 text-meta leading-relaxed text-ink-tertiary">
            The forecasting method is selected from demand characteristics and historical
            validation performance.
          </p>
        </section>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- headers */

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
  k,
  sort,
  onClick,
  numeric,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onClick: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const isActive = sort.key === k;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (sort.desc ? "descending" : "ascending") : "none"}
      className={`px-3 py-2.5 ${numeric ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onClick(k)}
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
