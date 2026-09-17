import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUpload } from "@/auth/db";
import { guessColumn } from "@/auth/dataset";
import { requireSession } from "@/auth/session";
import { AlertTriangle, Check, Info } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { formatNumber } from "@/lib/format";
import { ColumnQuestions } from "./column-questions";

export const metadata: Metadata = { title: "Confirm columns" };

/**
 * Data review, before anything is split.
 *
 * The file has been read but not interpreted. This screen asks the owner the
 * questions the split depends on — which column identifies the branch, which
 * one gives its location — and shows real values from their own file next to
 * each answer, so confirming is checking rather than trusting.
 *
 * The upload is fetched with the caller's own user id, so a guessed id from
 * someone else's session is a 404 rather than a look at their data.
 */
export default async function ConfirmColumnsPage({
  params,
}: PageProps<"/projects/new/review/[uploadId]">) {
  const { uploadId } = await params;
  const user = await requireSession();
  if (user.role !== "owner") notFound();

  const upload = getUpload(uploadId, user.id);
  if (!upload) notFound();

  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title="Confirm what these columns mean"
        description="Nothing is split until you answer. A wrong answer here would put a branch's numbers in front of the wrong manager."
        context={
          <>
            {upload.filename} · {formatNumber(upload.row_count)} rows ·{" "}
            {upload.columns.length} columns
          </>
        }
      />

      <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <Panel
          title="Column questions"
          description="Each answer is a guess from your column names. Change any that is wrong."
        >
          <ColumnQuestions
            uploadId={upload.id}
            columns={upload.columns}
            samples={upload.samples}
            defaultName={upload.filename.replace(/\.[^.]+$/, "")}
            guesses={{
              branchId: guessColumn(upload.columns, "branchId"),
              branchLocation: guessColumn(upload.columns, "branchLocation"),
              product: guessColumn(upload.columns, "product"),
            }}
          />
        </Panel>

        <div className="space-y-5">
          <Panel title="What happens on confirm">
            <ol className="space-y-3">
              {[
                "Rows are grouped by the branch column you confirmed.",
                "Each branch is filed under the location most of its rows report.",
                "Products are counted per branch, so each branch carries its own assortment.",
                "You become the owner of the project and decide who sees which branch.",
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-pale text-meta font-bold text-brand-deep">
                    {i + 1}
                  </span>
                  <p className="text-body-sm leading-relaxed text-ink-secondary">{step}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Columns in this file" padded={false}>
            <ul className="divide-y divide-border-subtle">
              {upload.columns.map((column) => (
                <li key={column} className="px-5 py-2.5">
                  <p className="text-body-sm font-medium text-ink">{column}</p>
                  <p className="truncate text-meta text-ink-tertiary">
                    {upload.samples[column]?.join(" · ") || "No values read"}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Forecasting service">
            {upload.dataset_id ? (
              <p className="flex items-start gap-2.5 text-body-sm leading-relaxed text-ink-secondary">
                <Check size={16} className="mt-0.5 shrink-0 text-status-healthy" />
                <span>
                  The same file was accepted as dataset{" "}
                  <code className="font-mono text-ink">{upload.dataset_id}</code>. Confirming
                  below goes straight on to its column mapping, where the forecast is started.
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2.5 text-body-sm leading-relaxed text-status-watch">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  The forecasting service did not accept this file — it may be down. The branch
                  split still works and the project will still be created; its branches simply
                  have no dashboard behind them until the file is uploaded again.
                </span>
              </p>
            )}
          </Panel>

          <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
            <Info size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
            <p className="text-body-sm leading-relaxed text-ink-secondary">
              Branch splitting decides access, not forecasting. The forecasting service reads
              the same file separately and maps its own canonical fields.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
