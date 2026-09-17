"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "./lib/api";
import { Card, ErrorNote, Shell, Spinner } from "./components/ui";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function send(file: File) {
    setBusy(true);
    setError("");
    try {
      const result = await api.upload(file);
      router.push(`/mapping?id=${result.dataset_id}`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
      setBusy(false);
    }
  }

  return (
    <Shell step={1}>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Drop your sales export
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Any column names, any format. We detect the structure, you confirm it,
          and we forecast from there.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void send(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={[
            "mt-6 cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragging
              ? "border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800"
              : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
            }}
          />
          {busy ? (
            <div className="flex justify-center">
              <Spinner label="Profiling columns…" />
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">
                Drag a CSV here, or click to browse
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Accurate, Jubelio, HashMicro, SimpliDOTS and Moka exports are
                recognised automatically
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <ErrorNote error={error} />
          </div>
        )}

        <div className="mt-6">
          <Card title="Already integrated?" subtitle="Same pipeline, different transport.">
            <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
{`POST ${api.base}/api/v1/ingest/json
{ "source": "erp", "records": [
    { "transaction_date": "2026-09-01",
      "product_code": "ABC-01",
      "branch": "JKT01",
      "qty_out": 125 } ] }`}
            </pre>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
