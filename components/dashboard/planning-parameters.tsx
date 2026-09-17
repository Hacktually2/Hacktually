"use client";

import { useState } from "react";
import type { CategoryParameters, PlanningParameters } from "@/app/dummy-data/types";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { formatNumber } from "@/lib/format";

/**
 * Planning parameters.
 *
 * The decision engine needs lead time, service level and minimum order quantity
 * per item, and the value simulation needs margin and holding cost. None of
 * that can be forecast, and architecture.md is explicit that a missing
 * parameter is asked for rather than invented. Without this screen those
 * numbers were house constants nobody could see or change.
 *
 * Entry is per category with bulk apply, because a mid-market ops lead will not
 * type a lead time 428 times, and that is exactly where a trial dies.
 */
export function PlanningParametersButton({
  parameters,
  onSave,
}: {
  parameters: PlanningParameters;
  onSave: (next: PlanningParameters) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Planning parameters
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Planning parameters"
        description="What the forecast cannot tell us. These drive every recommended quantity."
      >
        {open && (
          <ParametersForm
            parameters={parameters}
            onDone={() => setOpen(false)}
            onSave={onSave}
          />
        )}
      </Modal>
    </>
  );
}

function ParametersForm({
  parameters,
  onDone,
  onSave,
}: {
  parameters: PlanningParameters;
  onDone: () => void;
  onSave: (next: PlanningParameters) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PlanningParameters>(parameters);
  const [saving, setSaving] = useState(false);

  const setCategory = (index: number, patch: Partial<CategoryParameters>) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c, i) =>
        i === index ? { ...c, ...patch, source: "user" } : c
      ),
    }));

  /** Bulk apply: the whole reason this screen is per category and not per SKU. */
  const applyToAll = (patch: Partial<CategoryParameters>) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.map((c) => ({ ...c, ...patch, source: "user" })),
    }));

  const missingValueInputs =
    draft.margin_percent === null || draft.holding_cost_percent === null;

  return (
    <div className="space-y-7">
      <section>
        <h3 className="text-body-sm font-semibold text-brand-deep">Value assumptions</h3>
        <p className="mt-0.5 mb-3 text-meta text-ink-tertiary">
          Used only by the simulated policy outcome. Without them the rupiah figures are
          withheld rather than estimated.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Gross margin"
            suffix="%"
            value={draft.margin_percent}
            onChange={(v) => setDraft((d) => ({ ...d, margin_percent: v }))}
          />
          <NumberField
            label="Holding cost, annual"
            suffix="%"
            value={draft.holding_cost_percent}
            onChange={(v) => setDraft((d) => ({ ...d, holding_cost_percent: v }))}
          />
        </div>
        {missingValueInputs && (
          <p className="mt-2.5 flex items-start gap-2 text-meta text-ink-secondary">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
            The value panel will show as unavailable until both are set.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-body-sm font-semibold text-brand-deep">By category</h3>
          <div className="flex items-center gap-2 text-meta">
            <span className="text-ink-tertiary">Apply to all:</span>
            {[90, 95, 98].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => applyToAll({ service_level: level })}
                className="rounded-sm border border-border-subtle px-2 py-0.5 font-medium text-ink-secondary hover:border-border-strong/50 hover:text-brand-deep"
              >
                {level}% service
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-default">
                {["Category", "Lead time", "Service", "MOQ"].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`pb-2 text-meta font-semibold tracking-wide text-ink-tertiary uppercase ${
                      i > 0 ? "px-2 text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.categories.map((c, i) => (
                <tr key={c.category} className="border-b border-border-subtle">
                  <td className="py-2">
                    <p className="text-body-sm font-medium text-ink">{c.category}</p>
                    <p className="text-meta text-ink-tertiary">
                      {formatNumber(c.series_count)} series
                      {c.overrides > 0 && ` · ${c.overrides} with a per-SKU value`}
                      {c.source === "dataset" && " · from your file"}
                    </p>
                  </td>
                  <Cell>
                    <Stepper
                      value={c.lead_time_days}
                      suffix="d"
                      onChange={(v) => setCategory(i, { lead_time_days: v })}
                    />
                  </Cell>
                  <Cell>
                    <Stepper
                      value={c.service_level}
                      suffix="%"
                      onChange={(v) => setCategory(i, { service_level: v })}
                    />
                  </Cell>
                  <Cell>
                    <Stepper
                      value={c.moq}
                      step={50}
                      onChange={(v) => setCategory(i, { moq: v })}
                    />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-2 text-meta text-ink-secondary">
          <Info size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
          A category value applies to every SKU in it except those carrying their own. Per-SKU
          overrides are edited from the item row.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(draft);
            setSaving(false);
            onDone();
          }}
        >
          {saving ? "Saving…" : "Save and recalculate"}
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <p className="text-meta text-ink-tertiary">
          Saving re-runs the decision engine. Forecasts are unaffected.
        </p>
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-2 text-right">{children}</td>;
}

function Stepper({
  value,
  suffix = "",
  step = 1,
  onChange,
}: {
  value: number;
  suffix?: string;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="h-8 w-20 rounded-sm border border-border-default bg-surface-card px-2 text-right text-body-sm text-ink focus:border-brand-blue focus:outline-none"
        data-numeric
      />
      {suffix && <span className="text-meta text-ink-tertiary">{suffix}</span>}
    </span>
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-body-sm font-medium text-brand-deep">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value ?? ""}
          placeholder="Not set"
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="h-9 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body-sm text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
          data-numeric
        />
        <span className="text-body-sm text-ink-tertiary">{suffix}</span>
      </span>
    </label>
  );
}
