"use client";

import { useState, useTransition } from "react";
import { sendProcurementAlert, type AlertState } from "@/app/projects/[projectId]/dashboard/supply-chain/actions";
import type { InventoryRow } from "@/app/dummy-data/types";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Clock, Info, Send } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { formatDays, formatNumber } from "@/lib/format";

/**
 * Sending the stockout alert — the only action in this app that leaves it.
 *
 * The MCP server makes one promise about this write (`send_procurement_alert`,
 * `backend/app/integrations/mcp_server.py`): a human sees what is going out
 * before it goes. There, an agent calls once for a preview and again with
 * `confirmed=True`. The REST endpoint has no dry run, so the promise is kept
 * here instead — every item is listed, individually removable, and nothing is
 * sent until the person looking at the list says so.
 *
 * Deliberately not a per-row button. A buyer alerts on a basket of items, and a
 * one-click send on a table row is how somebody alerts on the wrong SKU.
 */
export function ProcurementAlert({
  projectId,
  datasetId,
  rows,
}: {
  projectId: string;
  datasetId: string;
  /** Already narrowed to what needs attention by the caller. */
  rows: InventoryRow[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.map((row) => row.series_id)),
  );
  const [state, setState] = useState<AlertState>({ error: null, result: null });
  const [pending, startTransition] = useTransition();

  function toggle(seriesId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(seriesId)) next.delete(seriesId);
      else next.add(seriesId);
      return next;
    });
  }

  function close() {
    setOpen(false);
    // Reset only once closed, so the result stays readable while it is open.
    setState({ error: null, result: null });
    setSelected(new Set(rows.map((row) => row.series_id)));
  }

  function send() {
    startTransition(async () => {
      setState(await sendProcurementAlert(projectId, datasetId, [...selected]));
    });
  }

  if (rows.length === 0) return null;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Send size={15} />
        Alert procurement
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Send procurement alert"
        description="Review exactly what goes out. Nothing is sent until you confirm."
      >
        {state.result ? (
          <Sent result={state.result} onClose={close} />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <li key={row.series_id} className="py-2.5 first:pt-0">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(row.series_id)}
                      onChange={() => toggle(row.series_id)}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-brand-blue)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-semibold text-ink">
                        {row.item_name}
                        <span className="ml-1.5 font-normal text-ink-tertiary">
                          {row.location}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-ink-secondary">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          Stockout {formatDays(row.days_until_stockout)}
                        </span>
                        <span data-numeric>
                          Order {formatNumber(row.recommended_qty)} units
                        </span>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <p className="mt-4 flex items-start gap-2 rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2.5 text-meta text-ink-secondary">
              <Info size={14} className="mt-0.5 shrink-0 text-brand-blue-ink" />
              This goes to the procurement channel as a recommendation. It does not raise a
              purchase order — a person still does that.
            </p>

            {state.error && (
              <p
                className="mt-3 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
                role="alert"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {state.error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
              <p className="mr-auto text-body-sm text-ink-secondary" aria-live="polite">
                {selected.size === 0
                  ? "Nothing selected."
                  : `${selected.size} of ${rows.length} items will be sent.`}
              </p>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" onClick={send} disabled={pending || selected.size === 0}>
                {pending ? "Sending…" : "Send alert"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

/**
 * What actually went out.
 *
 * The backend formats the message, so this shows the text it reports sending
 * rather than a reconstruction. When no webhook is configured it returns the
 * payload unsent, which is worth saying plainly instead of rendering a tick.
 */
function Sent({
  result,
  onClose,
}: {
  result: NonNullable<AlertState["result"]>;
  onClose: () => void;
}) {
  return (
    <>
      <p
        className={`flex items-start gap-2 rounded-sm border px-3 py-2.5 text-body-sm ${
          result.sent
            ? "border-status-healthy/25 bg-status-healthy-surface text-status-healthy"
            : "border-status-watch/25 bg-status-watch-surface text-status-watch"
        }`}
        role="status"
      >
        {result.sent ? (
          <Check size={15} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        )}
        {result.sent
          ? "Sent to the procurement channel."
          : `Not sent — ${result.reason ?? "the channel is not configured"}. The message it would have sent is below.`}
      </p>

      <h3 className="mt-5 text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
        Message
      </h3>
      <pre className="mt-2 max-h-72 overflow-auto rounded-sm border border-border-subtle bg-surface-sunken/60 p-3 font-mono text-body-sm whitespace-pre-wrap text-ink-secondary">
        {result.message}
      </pre>

      <div className="mt-5 flex justify-end border-t border-border-subtle pt-4">
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}
