"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import type { MergePreview } from "@/app/dummy-data/types";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, Check, FileText, Info, Upload, X } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { formatDate, formatNumber } from "@/lib/format";

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = [".csv", ".tsv", ".json"];

/**
 * Incremental data update.
 *
 * Three steps: choose a file, read what merging it would do, then confirm.
 * The middle step is the point of the feature. Appending to a dataset that
 * already produced forecasts silently rewrites history, so the user sees
 * exactly how many rows are added, how many are replaced and how many are kept
 * before anything is written.
 *
 * The preview is a dry run on the server; this component only renders it.
 */
type Step = "choose" | "preview";

export function MergeFlow({
  projectId,
  datasetId,
  previewFor,
}: {
  projectId: string;
  datasetId: string;
  /** Server action standing in for POST /datasets/{id}/append?dry_run=true */
  previewFor: (datasetId: string, filename: string) => Promise<MergePreview>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const accept = useCallback((candidate: File | undefined) => {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
      setError(`${candidate.name} is not a supported format. Upload a CSV, TSV or JSON export.`);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError("That file is larger than 200 MB. Split the export or use the ingest API.");
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  async function runPreview() {
    if (!file) return;
    const result = await previewFor(datasetId, file.name);
    setPreview(result);
    setStep("preview");
  }

  if (step === "preview" && preview) {
    return (
      <MergeReview
        preview={preview}
        pending={pending}
        onBack={() => {
          setPreview(null);
          setStep("choose");
        }}
        // useTransition already reports the in-flight state, so there is no
        // separate "applying" step to fall out of this branch and flash the
        // upload screen mid-submit.
        onConfirm={() => {
          startTransition(() => router.push(`/projects/${projectId}/processing`));
        }}
      />
    );
  }

  return (
    <Panel
      title="Choose the newer export"
      description="Rows are matched on date and product. Overlapping rows are replaced, everything else is kept."
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={`rounded-md border border-dashed p-10 text-center transition-colors duration-(--duration-fast) ${
          dragging
            ? "border-brand-blue bg-brand-blue-soft"
            : "border-border-strong/45 bg-surface-sunken/40"
        }`}
      >
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-brand-pale text-brand-deep">
          <Upload size={20} />
        </span>
        <p className="mt-4 text-body font-semibold text-brand-deep">
          Drag and drop the updated export
        </p>
        <p className="mt-1 text-body-sm text-ink-secondary">
          It only needs the new period. Re-uploading the whole history also works.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>

      {error && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {file && (
        <div className="mt-4 flex items-center gap-3 rounded-sm border border-border-subtle bg-surface-card px-4 py-3">
          <FileText size={18} className="shrink-0 text-brand-blue-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-ink">{file.name}</p>
            <p className="text-meta text-ink-tertiary" data-numeric>
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="rounded-sm p-1.5 text-ink-tertiary hover:bg-surface-sunken hover:text-ink"
            aria-label={`Remove ${file.name}`}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" disabled={!file} onClick={runPreview}>
          Preview changes
          <ArrowRight size={17} />
        </Button>
        <p className="text-body-sm text-ink-secondary">Nothing is written until you confirm.</p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ preview */

function MergeReview({
  preview,
  pending,
  onBack,
  onConfirm,
}: {
  preview: MergePreview;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const extended = preview.coverage_after.to !== preview.coverage_before.to;

  return (
    <div className="space-y-5">
      <Panel
        title="What this merge will do"
        description={`${preview.incoming_filename} · ${formatNumber(preview.incoming_rows)} rows read`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure
            value={preview.rows_added}
            label="Rows added"
            hint="Dates and products not in the dataset yet"
            tone="text-status-healthy"
          />
          <Figure
            value={preview.rows_updated}
            label="Rows replaced"
            hint="Already present, with a different quantity"
            tone="text-status-watch"
          />
          <Figure
            value={preview.rows_retained}
            label="Rows kept"
            hint="Untouched by this file"
            tone="text-ink-secondary"
          />
        </div>

        <dl className="mt-5 grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-meta text-ink-tertiary">Coverage</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
              {formatDate(preview.coverage_before.from)} –{" "}
              {formatDate(preview.coverage_after.to)}
              {extended && (
                <span className="ml-2 text-body-sm font-normal text-status-healthy">
                  extended from {formatDate(preview.coverage_before.to)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-meta text-ink-tertiary">Series</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
              {formatNumber(preview.series_total_before)} →{" "}
              {formatNumber(preview.series_total_after)}
              {preview.series_new.length > 0 && (
                <span className="ml-2 text-body-sm font-normal text-ink-secondary">
                  {preview.series_new.length} new
                </span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      {preview.conflicts.length > 0 && (
        <Panel
          title="Overlapping rows"
          description="A sample of the rows this file restates. The incoming value wins."
          padded={false}
          footer={`Showing ${preview.conflicts.length} of ${formatNumber(preview.rows_updated)} replaced rows.`}
        >
          <div className="overflow-x-auto border-t border-border-subtle">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border-default">
                  {["Product", "Date", "Existing", "Incoming"].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-3 py-2.5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase ${
                        i > 1 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.conflicts.map((c) => (
                  <tr
                    key={`${c.series_id}-${c.timestamp}`}
                    className="border-b border-border-subtle"
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-body-sm font-medium text-ink">{c.item_name}</span>
                      <code className="ml-2 text-meta text-ink-tertiary">{c.series_id}</code>
                    </td>
                    <td className="px-3 py-2.5 text-body-sm text-ink-secondary" data-numeric>
                      {formatDate(c.timestamp)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-body-sm text-ink-tertiary line-through"
                      data-numeric
                    >
                      {formatNumber(c.existing_value)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-body-sm font-semibold text-ink"
                      data-numeric
                    >
                      {formatNumber(c.incoming_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {preview.warnings.length > 0 && (
        <Panel title="Before you confirm">
          <ul className="space-y-4">
            {preview.warnings.map((w) => (
              <li key={w.id} className="flex gap-3">
                {w.severity === "warning" ? (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-status-watch" />
                ) : (
                  <Info size={16} className="mt-0.5 shrink-0 text-ink-tertiary" />
                )}
                <div>
                  <p className="text-body-sm font-semibold text-ink">{w.title}</p>
                  <p className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">
                    {w.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={onConfirm} disabled={!preview.mergeable || pending}>
          {pending ? "Merging…" : "Merge and reprocess"}
          <Check size={17} />
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onBack} disabled={pending}>
          Choose a different file
        </Button>
      </div>
    </div>
  );
}

function Figure({
  value,
  label,
  hint,
  tone,
}: {
  value: number;
  label: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken/40 p-4">
      <p className={`text-metric leading-none font-bold ${tone}`} data-numeric>
        {formatNumber(value)}
      </p>
      <p className="mt-1.5 text-body-sm font-semibold text-ink">{label}</p>
      <p className="mt-0.5 text-meta text-ink-tertiary">{hint}</p>
    </div>
  );
}
