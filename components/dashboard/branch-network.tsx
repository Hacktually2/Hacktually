"use client";

import { useId, useState } from "react";
import type { RiskLevel } from "@/app/dummy-data/types";
import { AlertTriangle, ArrowRight, Database, Layers } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { RiskBadge } from "@/components/ui/status";
import { formatNumber, formatPercent } from "@/lib/format";

/**
 * The network as a portfolio map, not a diagram.
 *
 * This started as nodes arranged in a ring around a centre, and the ring was
 * the problem: six branches at equal angles and equal distance meant position
 * encoded nothing at all. It looked like a chart while carrying none of a
 * chart's information, and the perfect symmetry left the eye nowhere to land.
 * The centre was labelled with the network total, which is not something the
 * branches flow through.
 *
 * So position now does the work. Horizontal is how much of a branch's
 * catalogue needs ordering attention; vertical is how much catalogue it
 * carries; bubble area is its share of network demand; colour is the band.
 * Four dimensions, and the one question an owner opens this screen with —
 * where do I look first — is answered by looking up and to the right.
 *
 * The quadrant divider sits on the **measured network average**, not a round
 * number. "Above average" is then a fact about this company rather than our
 * opinion about what counts as bad.
 *
 * Risk is never decided here. The backend classifies it and this only
 * aggregates and positions what came back.
 */

export interface BranchNode {
  id: string;
  code: string;
  location: string;
  forecastProjectId: string | null;
  seriesCount: number;
  /** Share of items needing ordering attention, 0–1. Null: no run yet. */
  attentionShare: number | null;
  coverageDays: number | null;
  bands: { risk: RiskLevel; label: string; series_count: number }[];
  /** Why this branch has no numbers, when it has none. */
  note: string | null;
  /** Present when the branches came from one `/branches` call. */
  unitsToOrder?: number | null;
  unitsFromTransfer?: number | null;
  medianWapePercent?: number | null;
  demandSharePercent?: number | null;
}

// Printed in the legend. Absolute rather than relative to the network, so a
// network where every branch is struggling still looks like it is struggling.
const THRESHOLDS: { risk: RiskLevel; upTo: number; label: string }[] = [
  { risk: "healthy", upTo: 0.05, label: "under 5%" },
  { risk: "watch", upTo: 0.15, label: "5–15%" },
  { risk: "at_risk", upTo: 0.3, label: "15–30%" },
  { risk: "critical", upTo: Infinity, label: "over 30%" },
];

const FILL: Record<RiskLevel, string> = {
  healthy: "var(--color-status-healthy)",
  watch: "var(--color-status-watch)",
  at_risk: "var(--color-status-risk)",
  critical: "var(--color-status-critical)",
};

function bandOf(share: number | null): RiskLevel | null {
  if (share === null) return null;
  return THRESHOLDS.find((t) => share < t.upTo)?.risk ?? "critical";
}

/* ------------------------------------------------------------------ geometry */

const W = 720;
const H = 440;
const PAD = { top: 28, right: 30, bottom: 48, left: 58 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* -------------------------------------------------------------------- render */

export function BranchNetwork({
  branches,
  isOwner,
  networkAttentionShare,
}: {
  branches: BranchNode[];
  isOwner: boolean;
  /** Owner only. Managers must not be shown figures spanning other branches. */
  networkAttentionShare: number | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const titleId = useId();

  const plotted = branches.filter((b) => b.attentionShare !== null);
  const pending = branches.filter((b) => b.attentionShare === null);
  const active = branches.find((b) => b.id === activeId) ?? null;

  if (branches.length === 0) {
    return (
      <Panel title="No branches yet">
        <p className="text-body-sm text-ink-secondary">
          Upload a file with a branch column and each branch appears here.
        </p>
      </Panel>
    );
  }

  // Axes. The x ceiling never drops below 40% so a healthy network does not get
  // its differences magnified into a crisis by autoscaling.
  const maxAttention = Math.max(0.4, ...plotted.map((b) => b.attentionShare ?? 0)) * 1.12;
  const maxSeries = Math.max(1, ...plotted.map((b) => b.seriesCount)) * 1.15;
  const maxDemand = Math.max(1, ...plotted.map((b) => b.demandSharePercent ?? 0));

  const x = (share: number) => PAD.left + (share / maxAttention) * PLOT.w;
  const y = (count: number) => PAD.top + PLOT.h - (count / maxSeries) * PLOT.h;
  const radius = (demandShare: number | null | undefined) => {
    if (!demandShare) return 13;
    return 11 + 15 * Math.sqrt(Math.min(1, demandShare / maxDemand));
  };

  const divideX = networkAttentionShare ?? median(plotted.map((b) => b.attentionShare ?? 0));
  const divideY = median(plotted.map((b) => b.seriesCount));

  const worst = [...plotted].sort(
    (a, b) => (b.attentionShare ?? 0) - (a.attentionShare ?? 0),
  );

  const xTicks = [0, 0.15, 0.3, 0.45, 0.6].filter((t) => t <= maxAttention);

  return (
    <div className="space-y-5">
      <Panel
        title={isOwner ? "Branch network" : "Your branch"}
        description={
          isOwner
            ? "Right is more of the catalogue needing attention. Up is more catalogue carried. Bubble size is share of network demand. Look up and to the right first."
            : "Where your branch sits on attention needed against catalogue carried."
        }
        padded={false}
      >
        <div className="grid gap-0 border-t border-border-subtle lg:grid-cols-[1fr_minmax(0,320px)]">
          <div className="p-4">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              role="group"
              aria-labelledby={titleId}
            >
              <title id={titleId}>
                {plotted.length} branch{plotted.length === 1 ? "" : "es"} plotted by share of
                catalogue needing attention against catalogue size
              </title>

              {/* Quadrants. Only the one that means "act now" is tinted — tinting
                  all four turns a hierarchy into wallpaper. */}
              <rect
                x={x(divideX)}
                y={PAD.top}
                width={Math.max(0, PAD.left + PLOT.w - x(divideX))}
                height={Math.max(0, y(divideY) - PAD.top)}
                fill="var(--color-status-critical)"
                opacity={0.06}
              />
              <line
                x1={x(divideX)}
                y1={PAD.top}
                x2={x(divideX)}
                y2={PAD.top + PLOT.h}
                stroke="var(--color-status-risk)"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
              <line
                x1={PAD.left}
                y1={y(divideY)}
                x2={PAD.left + PLOT.w}
                y2={y(divideY)}
                stroke="var(--color-border-default)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left + PLOT.w - 6}
                y={PAD.top + 14}
                textAnchor="end"
                className="fill-ink-tertiary text-[10px] font-semibold"
              >
                LARGE AND STRUGGLING — LOOK HERE FIRST
              </text>
              <text
                x={x(divideX) + 5}
                y={PAD.top + PLOT.h + 30}
                className="fill-ink-tertiary text-[9px]"
              >
                network average {formatPercent(divideX * 100)}
              </text>

              {/* Axes */}
              <line
                x1={PAD.left}
                y1={PAD.top + PLOT.h}
                x2={PAD.left + PLOT.w}
                y2={PAD.top + PLOT.h}
                stroke="var(--color-border-strong)"
                strokeWidth={1}
              />
              <line
                x1={PAD.left}
                y1={PAD.top}
                x2={PAD.left}
                y2={PAD.top + PLOT.h}
                stroke="var(--color-border-strong)"
                strokeWidth={1}
              />
              {xTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={x(tick)}
                    y1={PAD.top + PLOT.h}
                    x2={x(tick)}
                    y2={PAD.top + PLOT.h + 4}
                    stroke="var(--color-border-strong)"
                  />
                  <text
                    x={x(tick)}
                    y={PAD.top + PLOT.h + 16}
                    textAnchor="middle"
                    className="fill-ink-tertiary text-[10px]"
                  >
                    {Math.round(tick * 100)}%
                  </text>
                </g>
              ))}
              <text
                x={PAD.left + PLOT.w / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-ink-secondary text-[11px] font-medium"
              >
                Products needing attention
              </text>
              <text
                x={14}
                y={PAD.top + PLOT.h / 2}
                textAnchor="middle"
                transform={`rotate(-90 14 ${PAD.top + PLOT.h / 2})`}
                className="fill-ink-secondary text-[11px] font-medium"
              >
                Products carried
              </text>
              {[0, Math.round(maxSeries / 2), Math.round(maxSeries * 0.9)].map((tick) => (
                <text
                  key={tick}
                  x={PAD.left - 8}
                  y={y(tick) + 3}
                  textAnchor="end"
                  className="fill-ink-tertiary text-[10px]"
                  data-numeric
                >
                  {formatNumber(tick)}
                </text>
              ))}

              {/* Bubbles last, so they sit above the grid. */}
              {plotted.map((branch) => {
                const share = branch.attentionShare ?? 0;
                const cx = x(share);
                const cy = y(branch.seriesCount);
                const r = radius(branch.demandSharePercent);
                const band = bandOf(share);
                const dim = activeId !== null && activeId !== branch.id;
                const isActive = activeId === branch.id;

                return (
                  <g
                    key={branch.id}
                    tabIndex={0}
                    role="button"
                    aria-label={
                      `${branch.code}, ${branch.location}. ` +
                      `${formatPercent(share * 100)} of ${formatNumber(branch.seriesCount)} ` +
                      `products need attention.`
                    }
                    className="cursor-pointer outline-none"
                    onMouseEnter={() => setActiveId(branch.id)}
                    onMouseLeave={() => setActiveId(null)}
                    onFocus={() => setActiveId(branch.id)}
                    onBlur={() => setActiveId(null)}
                    opacity={dim ? 0.4 : 1}
                  >
                    {isActive && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 6}
                        fill="none"
                        stroke={band ? FILL[band] : "var(--color-border-default)"}
                        strokeWidth={2}
                        opacity={0.5}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={band ? FILL[band] : "var(--color-surface-sunken)"}
                      fillOpacity={0.8}
                      stroke={band ? FILL[band] : "var(--color-border-default)"}
                      strokeWidth={1.5}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      className="pointer-events-none fill-white text-[11px] font-bold"
                    >
                      {Math.round(share * 100)}
                    </text>
                    <text
                      x={cx}
                      y={cy + r + 14}
                      textAnchor="middle"
                      className="pointer-events-none fill-ink text-[11px] font-semibold"
                    >
                      {branch.code}
                    </text>
                  </g>
                );
              })}
            </svg>

            <Legend />
          </div>

          <div className="border-t border-border-subtle p-5 lg:border-t-0 lg:border-l">
            {active ? (
              <BranchDetail
                branch={active}
                networkAttentionShare={isOwner ? networkAttentionShare : null}
              />
            ) : (
              <div className="flex h-full flex-col justify-center">
                <p className="text-body-sm font-semibold text-brand-deep">
                  {isOwner ? "Pick a branch" : "Your branch"}
                </p>
                <p className="mt-1.5 text-body-sm leading-relaxed text-ink-secondary">
                  Hover a bubble, or tab through them, to see what that branch is carrying
                  and what needs ordering.
                </p>
                {isOwner && worst.length > 0 && (
                  <p className="mt-4 flex items-start gap-2 text-body-sm text-ink-secondary">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-risk" />
                    <span>
                      <span className="font-semibold text-ink">{worst[0].code}</span> has the
                      largest share needing attention at{" "}
                      {formatPercent((worst[0].attentionShare ?? 0) * 100)}.
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {pending.length > 0 && (
        <Panel
          title={`${pending.length} branch${pending.length === 1 ? "" : "es"} not on the chart`}
          description="No forecast has run for these, so they have no attention rate to plot. They are listed rather than placed at zero, which would read as healthy."
        >
          <ul className="space-y-2">
            {pending.map((branch) => (
              <li key={branch.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-body-sm font-semibold text-ink">{branch.code}</span>
                <span className="text-body-sm text-ink-secondary">{branch.location}</span>
                <span className="text-meta text-ink-tertiary">
                  — {branch.note ?? "no forecast yet"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-subtle pt-3">
      <span className="text-meta font-medium text-ink-tertiary">
        Products needing attention
      </span>
      {THRESHOLDS.map((t) => (
        <span key={t.risk} className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: FILL[t.risk] }}
            aria-hidden
          />
          <span className="text-meta text-ink-secondary">{t.label}</span>
        </span>
      ))}
      <span className="text-meta text-ink-tertiary">· bubble size = share of demand</span>
    </div>
  );
}

function BranchDetail({
  branch,
  networkAttentionShare,
}: {
  branch: BranchNode;
  networkAttentionShare: number | null;
}) {
  const band = bandOf(branch.attentionShare);
  const delta =
    branch.attentionShare !== null && networkAttentionShare !== null
      ? branch.attentionShare - networkAttentionShare
      : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body font-bold text-brand-deep">{branch.code}</p>
          <p className="text-body-sm text-ink-secondary">{branch.location}</p>
        </div>
        {band && <RiskBadge risk={band} size="sm" />}
      </div>

      {branch.attentionShare === null ? (
        <p className="mt-4 flex items-start gap-2 text-body-sm leading-relaxed text-ink-secondary">
          <Database size={15} className="mt-0.5 shrink-0 text-ink-tertiary" />
          {branch.note ?? "No forecast has run for this branch yet."}
        </p>
      ) : (
        <>
          <dl className="mt-4 space-y-3">
            <Stat
              label="Products needing attention"
              value={formatPercent(branch.attentionShare * 100)}
              hint={
                delta === null
                  ? undefined
                  : Math.abs(delta) < 0.01
                    ? "in line with the network"
                    : `${formatPercent(Math.abs(delta) * 100)} ${
                        delta > 0 ? "worse" : "better"
                      } than the network average`
              }
            />
            <Stat label="Products carried" value={formatNumber(branch.seriesCount)} />
            {branch.coverageDays !== null && (
              <Stat
                label="Median cover"
                value={`${formatNumber(branch.coverageDays)} days`}
                hint="Half the catalogue has at least this much stock left."
              />
            )}
          </dl>

          {branch.bands.some((b) => b.series_count > 0) && (
            <div className="mt-4 border-t border-border-subtle pt-3">
              <p className="text-meta font-medium text-ink-tertiary">By risk band</p>
              <ul className="mt-2 space-y-1.5">
                {branch.bands
                  .filter((b) => b.series_count > 0)
                  .map((b) => (
                    <li key={b.risk} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: FILL[b.risk] }}
                          aria-hidden
                        />
                        <span className="text-body-sm text-ink-secondary">{b.label}</span>
                      </span>
                      <span className="text-body-sm font-semibold text-ink" data-numeric>
                        {formatNumber(b.series_count)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {(branch.unitsToOrder != null || branch.medianWapePercent != null) && (
            <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
              {branch.unitsToOrder != null && (
                <Stat
                  label="Units to order"
                  value={formatNumber(branch.unitsToOrder)}
                  hint={
                    branch.unitsFromTransfer
                      ? `${formatNumber(branch.unitsFromTransfer)} of them could come from another branch instead of a purchase.`
                      : undefined
                  }
                />
              )}
              {branch.demandSharePercent != null && (
                <Stat
                  label="Share of network demand"
                  value={formatPercent(branch.demandSharePercent)}
                />
              )}
              {branch.medianWapePercent != null && (
                <Stat
                  label="Median forecast error"
                  value={formatPercent(branch.medianWapePercent)}
                  hint="Backtested on this branch's own history."
                />
              )}
            </div>
          )}
        </>
      )}

      {branch.forecastProjectId && (
        <a
          href={`/projects/${branch.forecastProjectId}/dashboard`}
          className="mt-5 inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand-blue-ink hover:text-brand-blue-hover"
        >
          <Layers size={14} />
          Open this branch
          <ArrowRight size={14} />
        </a>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-meta font-medium text-ink-tertiary">{label}</dt>
      <dd className="text-metric leading-none font-bold text-brand-deep" data-numeric>
        {value}
      </dd>
      {hint && <p className="mt-1 text-meta text-ink-tertiary">{hint}</p>}
    </div>
  );
}
