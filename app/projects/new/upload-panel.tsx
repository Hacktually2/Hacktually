"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Upload, X } from "@/components/ui/icons";

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = [".csv", ".tsv", ".json"];

/**
 * Upload (design.md §53).
 *
 * Client-side because it owns drag state and the selected file. Validation runs
 * here for immediate feedback and must be repeated server-side once the real
 * ingest endpoint exists — this check is a convenience, not a trust boundary.
 */
export function UploadPanel({ targetProjectId }: { targetProjectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const accept = useCallback((candidate: File | undefined) => {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
      setFile(null);
      setError(`${candidate.name} is not a supported format. Upload a CSV, TSV or JSON export.`);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setFile(null);
      setError("That file is larger than 200 MB. Split the export or use the ingest API.");
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  return (
    <div>
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
          Drag and drop your dataset
        </p>
        <p className="mt-1 text-body-sm text-ink-secondary">CSV, TSV or JSON · up to 200 MB</p>

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

      <div className="mt-6 flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={!file || pending}
          onClick={() =>
            startTransition(() => router.push(`/projects/${targetProjectId}/processing`))
          }
        >
          {pending ? "Starting…" : "Start processing"}
        </Button>
        <p className="text-body-sm text-ink-secondary">
          Your data is profiled before any forecast runs.
        </p>
      </div>
    </div>
  );
}
