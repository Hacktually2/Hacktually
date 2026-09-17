"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  children,
  step,
  datasetId,
}: {
  children: ReactNode;
  step?: 1 | 2 | 3 | 4;
  datasetId?: string | null;
}) {
  return (
    <div className="min-h-full bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-neutral-900 text-xs font-bold text-white dark:bg-white dark:text-neutral-900">
              AF
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Adaptive Forecasting
            </span>
          </Link>
          {step ? <Steps current={step} datasetId={datasetId} /> : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

const STEP_LABELS = ["Upload", "Mapping", "Data health", "Actions"];

function Steps({ current, datasetId }: { current: number; datasetId?: string | null }) {
  const hrefs = [
    "/",
    datasetId ? `/mapping?id=${datasetId}` : "#",
    datasetId ? `/health?id=${datasetId}` : "#",
    datasetId ? `/dashboard?id=${datasetId}` : "#",
  ];
  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {STEP_LABELS.map((label, index) => {
        const n = index + 1;
        const state =
          n === current ? "current" : n < current ? "done" : "todo";
        return (
          <Link
            key={label}
            href={hrefs[index]}
            className={[
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              state === "current"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : state === "done"
                  ? "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  : "text-neutral-300 pointer-events-none dark:text-neutral-700",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && (
              <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
            )}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const styles: Record<string, string> = {
    high: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/20",
    medium:
      "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/20",
    low: "bg-neutral-100 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-400/20",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${styles[risk] ?? styles.low}`}
    >
      {risk}
    </span>
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.9
      ? "bg-emerald-500"
      : value >= 0.8
        ? "bg-blue-500"
        : "bg-amber-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-xs text-neutral-500">{pct}%</span>
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {error}
    </div>
  );
}
