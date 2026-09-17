"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { MappingField, MappingResponse } from "@/app/dummy-data/types";
import { Button } from "@/components/ui/button";
import { ChevronDown, Info } from "@/components/ui/icons";

/**
 * Mapping confirmation (frontend_user_flow.md §7, design.md §55).
 *
 * The system never proceeds silently on an ambiguous interpretation. Every row
 * shows what was detected, how confident it is, and why — and can be overridden
 * before anything runs.
 *
 * Overrides are held locally and submitted once, which is what
 * POST /api/v1/datasets/{id}/mapping expects.
 */
const CONFIDENCE = {
  high: { label: "High", className: "text-status-healthy bg-status-healthy-surface" },
  medium: { label: "Medium", className: "text-status-watch bg-status-watch-surface" },
  low: { label: "Low", className: "text-status-risk bg-status-risk-surface" },
} as const;

const RESOLVED_BY = {
  preset: "Matched a known export format",
  rule: "Detected by column rules",
  model: "Inferred from column metadata",
} as const;

export function MappingReview({
  mapping,
  dashboardHref,
}: {
  mapping: MappingResponse;
  dashboardHref: string;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const changeCount = useMemo(
    () =>
      Object.entries(overrides).filter(([column, value]) => {
        const field = mapping.fields.find((f) => f.source_column === column);
        return field && field.canonical_key !== value;
      }).length,
    [overrides, mapping.fields]
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-default">
              {["Your column", "Detected meaning", "Sample values", "Confidence"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-3 py-2.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapping.fields.map((field) => (
              <MappingRow
                key={field.source_column}
                field={field}
                value={overrides[field.source_column] ?? field.canonical_key}
                onChange={(value) =>
                  setOverrides((prev) => ({ ...prev, [field.source_column]: value }))
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {mapping.unmapped_columns.length > 0 && (
        <p className="mt-5 flex items-start gap-2 rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2.5 text-body-sm text-ink-secondary">
          <Info size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />
          <span>
            {mapping.unmapped_columns.length} columns were not mapped and will be ignored:{" "}
            <span className="font-medium text-ink">{mapping.unmapped_columns.join(", ")}</span>.
            They remain in the source file.
          </span>
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
        <Button
          size="lg"
          disabled={pending}
          onClick={() => startTransition(() => router.push(dashboardHref))}
        >
          {pending ? "Confirming…" : "Confirm mapping"}
        </Button>
        <p className="text-body-sm text-ink-secondary">
          {changeCount === 0
            ? "No changes to the detected mapping."
            : `${changeCount} ${changeCount === 1 ? "column" : "columns"} changed. Confirming reprocesses the dataset.`}
        </p>
      </div>
    </div>
  );
}

function MappingRow({
  field,
  value,
  onChange,
}: {
  field: MappingField;
  value: string;
  onChange: (value: string) => void;
}) {
  const confidence = CONFIDENCE[field.confidence];
  const changed = value !== field.canonical_key;
  // Alternatives plus the detected option itself, so the current choice is selectable.
  const options = [
    { canonical_key: field.canonical_key, label: field.detected_field },
    ...field.alternatives,
  ];

  return (
    <>
      <tr className="border-b border-border-subtle align-top">
        <td className="px-3 py-3">
          <code className="text-body-sm font-semibold text-ink">{field.source_column}</code>
          {field.required && (
            <span className="mt-1 block text-meta text-ink-tertiary">Required field</span>
          )}
        </td>
        <td className="px-3 py-3">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Meaning of ${field.source_column}`}
            className={`h-9 w-full max-w-52 rounded-sm border bg-surface-card px-2 text-body-sm font-medium focus:border-brand-blue focus:outline-none ${
              changed ? "border-brand-blue text-brand-deep" : "border-border-default text-ink"
            }`}
          >
            {options.map((o) => (
              <option key={o.canonical_key} value={o.canonical_key}>
                {o.label}
              </option>
            ))}
          </select>
          {changed && (
            <span className="mt-1 block text-meta font-medium text-brand-blue">
              Changed from {field.detected_field}
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          <span className="text-body-sm text-ink-secondary" data-numeric>
            {field.sample_values.join(" · ")}
          </span>
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-meta font-semibold ${confidence.className}`}
          >
            {confidence.label}
          </span>
          <span className="mt-1 block text-meta text-ink-tertiary">
            {RESOLVED_BY[field.resolved_by]}
          </span>
        </td>
      </tr>
      {/* Reasoning is progressive disclosure: present for every row, expanded by
          nobody unless they doubt the result. */}
      <tr className="border-b border-border-subtle">
        <td colSpan={4} className="px-3 pb-3">
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-meta font-medium text-brand-blue hover:text-brand-blue-hover">
              <ChevronDown
                size={13}
                className="transition-transform duration-(--duration-fast) group-open:rotate-180"
              />
              Why this interpretation?
            </summary>
            <p className="mt-1.5 max-w-3xl text-body-sm leading-relaxed text-ink-secondary">
              {field.reasoning}
            </p>
          </details>
        </td>
      </tr>
    </>
  );
}
