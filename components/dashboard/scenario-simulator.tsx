"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ScenarioInput, ScenarioOutcome, ScenarioRow } from "@/app/dummy-data/types";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowRight, ArrowUp, Info, Minus } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { RiskBadge } from "@/components/ui/status";
import { formatDays, formatNumber } from "@/lib/format";

/**
 * Scenario simulator.
 *
 * Levers on the left, the current plan against the simulated one on the right.
 * Every lever is a variable the decision engine already uses, so this is that
 * engine run with different inputs rather than a second model.
 *
 * The run happens in a server action. Changes are debounced rather than fired
 * per pixel of slider travel, and the previous result stays on screen while the
 * next one is in flight, so numbers never blank out mid-drag.
 */
const NEUTRAL: ScenarioInput = {
  lead_time_multiplier: 1,
  demand_multiplier: 1,
  service_level: 95,
  moq_multiplier: 1,
  capacity_units: null,
};

export function ScenarioSimulator({
  datasetId,
  initial,
  run,
}: {
  datasetId: string;
  /** Neutral run, computed on the server so the panel opens with real numbers. */
  initial: ScenarioOutcome;
  run: (datasetId: string, scenario: ScenarioInput) => Promise<ScenarioOutcome>;
}) {
  const [scenario, setScenario] = useState<ScenarioInput>(initial.scenario);
  const [outcome, setOutcome] = useState<ScenarioOutcome>(initial);
  const [pending, startTransition] = useTransition();
  const applied = useRef(JSON.stringify(initial.scenario));

  useEffect(() => {
    const next = JSON.stringify(scenario);
    if (next === applied.current) return;
    const timer = setTimeout(() => {
      applied.current = next;
      startTransition(async () => setOutcome(await run(datasetId, scenario)));
    }, 220);
    return () => clearTimeout(timer);
  }, [scenario, datasetId, run]);

  const set = <K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) =>
    setScenario((s) => ({ ...s, [key]: value }));

  const dirty = JSON.stringify(scenario) !== JSON.stringify(NEUTRAL);
  const changed = outcome.rows.filter((r) => r.qty_after !== r.qty_before);

  return (
    <div className="space-y-5">
      <Panel
        title="Scenario"
        description="Change the assumptions and compare against the current plan. Nothing here is saved or ordered."
        action={
          dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setScenario(NEUTRAL)}>
              Reset
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* ------------------------------------------------------ levers */}
          <div className="space-y-5">
            <Slider
              label="Supplier lead time"
              value={scenario.lead_time_multiplier}
              min={0.5}
              max={2}
              step={0.25}
              format={(v) => `${v}×`}
              hint={
                scenario.lead_time_multiplier === 1
                  ? "As quoted today"
                  : `${scenario.lead_time_multiplier > 1 ? "Slower" : "Faster"} than quoted`
              }
              onChange={(v) => set("lead_time_multiplier", v)}
            />

            <Slider
              label="Demand"
              value={scenario.demand_multiplier}
              min={0.5}
              max={2.5}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              hint={
                scenario.demand_multiplier === 1
                  ? "The forecast as generated"
                  : "Applied evenly across the horizon"
              }
              onChange={(v) => set("demand_multiplier", Number(v.toFixed(1)))}
            />

            <Choice
              label="Service level"
              value={scenario.service_level}
              options={[90, 95, 98, 99]}
              format={(v) => `${v}%`}
              onChange={(v) => set("service_level", v)}
            />

            <Choice
              label="Minimum order quantity"
              value={scenario.moq_multiplier}
              options={[1, 2]}
              format={(v) => `${v}×`}
              onChange={(v) => set("moq_multiplier", v)}
            />

            <Capacity
              value={scenario.capacity_units}
              onChange={(v) => set("capacity_units", v)}
            />
          </div>

          {/* ----------------------------------------------------- outcome */}
          <div
            className={`transition-opacity duration-(--duration-fast) ${
              pending ? "opacity-60" : "opacity-100"
            }`}
            aria-busy={pending}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Delta
                label="Units to order"
                before={outcome.baseline.units_to_order}
                after={outcome.simulated.units_to_order}
              />
              <Delta
                label="Items at risk"
                before={outcome.baseline.items_at_risk}
                after={outcome.simulated.items_at_risk}
                lowerIsBetter
              />
              <Delta
                label="Items needing an order"
                before={outcome.baseline.items_needing_order}
                after={outcome.simulated.items_needing_order}
              />
              <Delta
                label="Median cover"
                before={outcome.baseline.median_cover_days}
                after={outcome.simulated.median_cover_days}
                suffix=" days"
                higherIsBetter
              />
            </div>

            {outcome.notes.length > 0 && (
              <ul className="mt-5 space-y-2.5 border-t border-border-subtle pt-4">
                {outcome.notes.map((note) => (
                  <li key={note} className="flex gap-2.5">
                    <Info size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />
                    <p className="text-body-sm leading-relaxed text-ink-secondary">{note}</p>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-meta text-ink-tertiary">
              Figures are in units and days. A rupiah view needs unit cost, which this dataset
              does not carry.
            </p>
          </div>
        </div>
      </Panel>

      {changed.length > 0 && (
        <Panel
          title="Items this changes"
          description={`${changed.length} of ${outcome.rows.length} items order differently under this scenario.`}
          padded={false}
          footer="Ordered by how much the quantity moved."
        >
          <div className="overflow-x-auto border-t border-border-subtle">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-default">
                  {["Product", "Status", "Cover", "Order now", "Order in scenario"].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-3 py-2.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase ${
                        i >= 2 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {changed.map((row) => (
                  <ChangedRow key={row.series_id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- outcome */

function Delta({
  label,
  before,
  after,
  suffix = "",
  lowerIsBetter = false,
  higherIsBetter = false,
}: {
  label: string;
  before: number;
  after: number;
  suffix?: string;
  lowerIsBetter?: boolean;
  higherIsBetter?: boolean;
}) {
  const diff = after - before;
  // Direction is only coloured where one is unambiguously better. More units to
  // order is not good or bad on its own, so it stays neutral.
  const tone =
    diff === 0 || (!lowerIsBetter && !higherIsBetter)
      ? "text-ink-secondary"
      : (diff < 0) === lowerIsBetter
        ? "text-status-healthy"
        : "text-status-risk";
  const Icon = diff === 0 ? Minus : diff > 0 ? ArrowUp : ArrowDown;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken/40 p-4">
      <p className="text-meta font-medium text-ink-tertiary">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-body-sm text-ink-tertiary line-through" data-numeric>
          {formatNumber(before)}
          {suffix}
        </span>
        <ArrowRight size={13} className="text-ink-tertiary" />
        <span className="text-metric leading-none font-bold text-brand-deep" data-numeric>
          {formatNumber(after)}
          {suffix}
        </span>
      </p>
      <p className={`mt-1.5 flex items-center gap-1 text-meta font-medium ${tone}`}>
        <Icon size={12} />
        {diff === 0 ? "No change" : `${formatNumber(Math.abs(diff))}${suffix} ${diff > 0 ? "more" : "fewer"}`}
      </p>
    </div>
  );
}

function ChangedRow({ row }: { row: ScenarioRow }) {
  return (
    <tr className="border-b border-border-subtle">
      <td className="px-3 py-2.5">
        <p className="text-body-sm font-medium text-ink">{row.item_name}</p>
        <p className="text-meta text-ink-tertiary">
          {row.location}
          {row.deferred && (
            <span className="ml-2 font-semibold text-status-watch">deferred by capacity</span>
          )}
        </p>
      </td>
      <td className="px-3 py-2.5">
        {row.risk_after === row.risk_before ? (
          <RiskBadge risk={row.risk_after} size="sm" />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <RiskBadge risk={row.risk_before} size="sm" />
            <ArrowRight size={12} className="text-ink-tertiary" />
            <RiskBadge risk={row.risk_after} size="sm" />
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink-secondary" data-numeric>
        {formatDays(row.cover_before)} → {formatDays(row.cover_after)}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm text-ink-tertiary" data-numeric>
        {row.qty_before === 0 ? "—" : formatNumber(row.qty_before)}
      </td>
      <td className="px-3 py-2.5 text-right text-body-sm font-semibold text-brand-deep" data-numeric>
        {row.qty_after === 0 ? "—" : formatNumber(row.qty_after)}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------- levers */

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-body-sm font-semibold text-brand-deep">{label}</label>
        <output className="text-body-sm font-bold text-brand-deep" data-numeric>
          {format(value)}
        </output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-brand-blue"
      />
      <p className="mt-1 text-meta text-ink-tertiary">{hint}</p>
    </div>
  );
}

function Choice<T extends number>({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-body-sm font-semibold text-brand-deep">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2 inline-flex flex-wrap gap-1 rounded-md border border-border-subtle bg-surface-sunken/60 p-1"
      >
        {options.map((option) => {
          const active = option === value;
          return (
            <label
              key={option}
              className={`cursor-pointer rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-(--duration-fast) ${
                active
                  ? "bg-surface-card text-brand-deep shadow-ambient"
                  : "text-ink-secondary hover:text-brand-deep"
              }`}
            >
              <input
                type="radio"
                name={label}
                checked={active}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {format(option)}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Capacity({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const limited = value !== null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-body-sm font-semibold text-brand-deep">Order capacity</p>
        <button
          type="button"
          onClick={() => onChange(limited ? null : 10000)}
          className="text-meta font-semibold text-brand-blue-ink hover:text-brand-blue-hover"
        >
          {limited ? "Remove limit" : "Set a limit"}
        </button>
      </div>
      {limited ? (
        <input
          type="number"
          min={0}
          step={500}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          aria-label="Order capacity in units"
          className="mt-2 h-9 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body-sm text-ink focus:border-brand-blue focus:outline-none"
        />
      ) : (
        <p className="mt-1 text-meta text-ink-tertiary">
          Unconstrained. Set a limit to see what gets deferred.
        </p>
      )}
      {limited && (
        <p className="mt-1 text-meta text-ink-tertiary">
          Units orderable this cycle. Spent on the most urgent items first.
        </p>
      )}
    </div>
  );
}
