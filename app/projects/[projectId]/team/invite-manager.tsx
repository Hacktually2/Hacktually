"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { inviteManager, type InviteState } from "@/auth/actions";
import type { Branch } from "@/auth/db";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check } from "@/components/ui/icons";

const INITIAL: InviteState = { error: null, invited: null };

/**
 * Registers another address as a manager of specific branches.
 *
 * There is no mail server, so a new account's password comes back once and is
 * shown here for the owner to pass on. An address that already has an account
 * is simply granted the branches, and no password is shown because none was
 * created.
 */
export function InviteManager({
  projectId,
  branches,
}: {
  projectId: string;
  branches: Branch[];
}) {
  const [state, action] = useActionState(inviteManager, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />

      <div>
        <label htmlFor="invite-email" className="mb-1.5 block text-body-sm font-medium text-brand-deep">
          Email address
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="nama@gmail.com"
          className="h-10 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="invite-name" className="mb-1.5 block text-body-sm font-medium text-brand-deep">
          Name <span className="font-normal text-ink-tertiary">optional</span>
        </label>
        <input
          id="invite-name"
          name="name"
          className="h-10 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink focus:border-brand-blue focus:outline-none"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-body-sm font-medium text-brand-deep">
          Branches they manage
        </legend>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {branches.map((branch) => (
            <li key={branch.id}>
              <label className="flex items-center gap-2.5 rounded-sm px-1 py-1 text-body-sm text-ink-secondary hover:bg-brand-pale-soft/60">
                <input
                  type="checkbox"
                  name="branch_ids"
                  value={branch.id}
                  className="size-4 accent-[var(--color-brand-blue)]"
                />
                <span>
                  <span className="font-medium text-ink">{branch.location}</span>{" "}
                  <span className="text-ink-tertiary">{branch.code}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.error && (
        <p
          className="flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      {state.invited && (
        <div
          className="rounded-sm border border-status-healthy/25 bg-status-healthy-surface px-3 py-2.5"
          role="status"
        >
          <p className="flex items-start gap-2 text-body-sm text-status-healthy">
            <Check size={15} className="mt-0.5 shrink-0" />
            <span>
              {state.invited.email} now manages {state.invited.branches}{" "}
              {state.invited.branches === 1 ? "branch" : "branches"}.
            </span>
          </p>
          {state.invited.password && (
            <p className="mt-2 text-meta text-ink-secondary">
              One-time password — send it to them, it is not shown again:{" "}
              <span className="font-mono font-semibold text-ink">{state.invited.password}</span>
            </p>
          )}
        </div>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Registering…" : "Register manager"}
    </Button>
  );
}
