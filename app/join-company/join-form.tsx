"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { joinCompany, type JoinCompanyState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "@/components/ui/icons";

const INITIAL: JoinCompanyState = { error: null };

/**
 * No role field, and no company field.
 *
 * The role is always `manager` and the company is copied from whoever owns the
 * token, both decided on the server. Either one as an input would be a value
 * the person filling this in could choose for themselves.
 */
export function JoinCompanyForm({ defaultToken }: { defaultToken: string }) {
  const [state, action] = useActionState(joinCompany, INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Company token"
        name="token"
        defaultValue={defaultToken}
        placeholder="Paste the token your owner sent you"
        hint="One token per company. Ask your owner if it has expired."
        required
      />
      <Field label="Your name" name="name" autoComplete="name" required />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="nama@perusahaan.co.id"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
      />

      {state.error && (
        <p
          className="flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Joining…" : "Join company"}
    </Button>
  );
}

function Field({
  label,
  name,
  hint,
  ...props
}: { label: string; name: string; hint?: string } & React.ComponentProps<"input">) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-body-sm font-medium text-brand-deep">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="h-10 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
        {...props}
      />
      {hint && <p className="mt-1 text-meta text-ink-tertiary">{hint}</p>}
    </div>
  );
}
