"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUpOwner, type SignUpState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "@/components/ui/icons";

const INITIAL: SignUpState = { error: null };

/**
 * There is no role field here, and there should never be one: buying a plan is
 * what makes someone an owner, and a role read from the request is a role
 * anyone can claim.
 */
export function SignUpForm() {
  const [state, action] = useActionState(signUpOwner, INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Your name" name="name" autoComplete="name" required />
      <Field
        label="Company"
        name="organisation"
        autoComplete="organization"
        placeholder="PT Contoh Distribusi"
        required
      />
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
      {pending ? "Creating your workspace…" : "Create workspace"}
    </Button>
  );
}

function Field({
  label,
  name,
  hint,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
} & React.ComponentProps<"input">) {
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
