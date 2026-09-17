"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestBranchAccess, type RequestState } from "@/auth/actions";
import type { Branch } from "@/auth/db";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Clock } from "@/components/ui/icons";

const INITIAL: RequestState = { error: null, submitted: 0 };

export function RequestAccess({
  projectId,
  branches,
  grantedIds,
  pendingIds,
}: {
  projectId: string;
  branches: Branch[];
  grantedIds: string[];
  pendingIds: string[];
}) {
  const [state, action] = useActionState(requestBranchAccess, INITIAL);
  const granted = new Set(grantedIds);
  const pending = new Set(pendingIds);

  return (
    <form action={action}>
      <input type="hidden" name="project_id" value={projectId} />

      <ul className="divide-y divide-border-subtle">
        {branches.map((branch) => {
          const held = granted.has(branch.id);
          const waiting = pending.has(branch.id);
          return (
            <li key={branch.id} className="py-2.5 first:pt-0">
              <label
                className={`flex items-center gap-3 ${held ? "cursor-default" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  name="branch_ids"
                  value={branch.id}
                  disabled={held}
                  className="size-4 accent-[var(--color-brand-blue)] disabled:opacity-40"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-ink">
                    {branch.location}
                  </span>
                  <span className="block text-meta text-ink-tertiary">
                    {branch.code} · {branch.product_count} products
                  </span>
                </span>
                {held && (
                  <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-status-healthy">
                    <Check size={13} />
                    Approved
                  </span>
                )}
                {!held && waiting && (
                  <span className="flex shrink-0 items-center gap-1.5 text-meta font-medium text-status-watch">
                    <Clock size={13} />
                    Awaiting decision
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <label htmlFor="note" className="mb-1.5 block text-body-sm font-medium text-brand-deep">
          Why you need these branches{" "}
          <span className="font-normal text-ink-tertiary">optional</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={280}
          placeholder="I manage the Surabaya branch and handle its weekly replenishment."
          className="w-full rounded-sm border border-border-default bg-surface-card px-3 py-2 text-body text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
        />
      </div>

      {state.error && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      {state.submitted > 0 && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-healthy/25 bg-status-healthy-surface px-3 py-2.5 text-body-sm text-status-healthy"
          role="status"
        >
          <Check size={15} className="mt-0.5 shrink-0" />
          {state.submitted} {state.submitted === 1 ? "request" : "requests"} sent. The owner
          decides next.
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="mt-5" disabled={pending}>
      {pending ? "Sending…" : "Request access"}
    </Button>
  );
}
