"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadDataset, type UploadState } from "./actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Upload, X } from "@/components/ui/icons";

const MAX_BYTES = 64 * 1024 * 1024;
const ACCEPTED = [".csv", ".tsv"];
const INITIAL: UploadState = { error: null };

/**
 * Upload (design.md §53).
 *
 * Client-side because it owns drag state and the chosen file. The checks here
 * are for immediate feedback only — `uploadDataset` repeats every one of them
 * on the server, which is the actual boundary.
 *
 * A drop assigns the file to the real <input> rather than to component state,
 * so the form submits the same way whether the file was dropped or chosen and
 * there is no second upload path to keep in step.
 */
export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, action] = useActionState(uploadDataset, INITIAL);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback((candidate: File | undefined) => {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
      setFile(null);
      setLocalError(`${candidate.name} is not a supported format. Upload a CSV or TSV export.`);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setFile(null);
      setLocalError("That file is larger than 64 MB. Split the export or use the ingest API.");
      return;
    }
    setLocalError(null);
    setFile(candidate);
  }, []);

  function clear() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const error = localError ?? state.error;

  return (
    <form action={action}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          // Hand the drop to the input so the form carries it on submit.
          if (inputRef.current) inputRef.current.files = e.dataTransfer.files;
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
        <p className="mt-1 text-body-sm text-ink-secondary">CSV or TSV · up to 64 MB</p>

        <input
          ref={inputRef}
          type="file"
          name="file"
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
            onClick={clear}
            className="rounded-sm p-1.5 text-ink-tertiary hover:bg-surface-sunken hover:text-ink"
            aria-label={`Remove ${file.name}`}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Submit ready={Boolean(file)} />
    </form>
  );
}

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-6 flex items-center gap-3">
      <Button type="submit" size="lg" disabled={!ready || pending}>
        {pending ? "Uploading…" : "Start processing"}
      </Button>
      <p className="text-body-sm text-ink-secondary" aria-live="polite">
        {pending
          ? "Reading the file. Nothing is interpreted until you confirm."
          : "You confirm what each column means before anything is split."}
      </p>
    </div>
  );
}
