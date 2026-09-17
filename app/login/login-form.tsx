"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "@/components/ui/icons";
import { signIn, type SignInState } from "@/auth/actions";

const INITIAL: SignInState = { error: null };

/** Only what the demo panel needs — the server page decides what to pass. */
export interface DemoCredential {
  email: string;
  password: string;
  name: string;
  role: string;
  /** What this account is for — the roles do genuinely different things. */
  blurb: string;
}

export function LoginForm({ demoAccounts }: { demoAccounts: DemoCredential[] }) {
  const [state, action] = useActionState(signIn, INITIAL);
  // Controlled so the demo panel can fill both fields in one click.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <>
      <form action={action} className="space-y-4" noValidate>
        <Labelled label="Work email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@perusahaan.co.id"
            className="h-10 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
          />
        </Labelled>

        <Labelled label="Password" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink focus:border-brand-blue focus:outline-none"
          />
        </Labelled>

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

      {demoAccounts.length > 0 && (
        <section className="mt-6 rounded-md border border-dashed border-border-strong/40 bg-surface-sunken/50 p-4">
          <h2 className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
            Demo accounts
          </h2>
          <p className="mt-1 text-meta text-ink-tertiary">
            This is a prototype build. Owner and manager see different products.
          </p>

          <ul className="mt-3 space-y-3">
            {demoAccounts.map((account) => (
              <li key={account.email}>
                <p className="text-body-sm font-semibold text-brand-deep">
                  {account.name}
                  <span className="ml-1.5 rounded-full border border-border-subtle px-1.5 py-0.5 text-meta font-medium text-ink-tertiary">
                    {account.role}
                  </span>
                </p>
                <p className="mt-0.5 text-meta leading-relaxed text-ink-tertiary">
                  {account.blurb}
                </p>
                <dl className="mt-1.5 space-y-0.5">
                  <Credential label="Email" value={account.email} />
                  <Credential label="Password" value={account.password} />
                </dl>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                  className="mt-2 text-body-sm font-semibold text-brand-blue-ink transition-colors duration-(--duration-fast) hover:text-brand-blue-hover"
                >
                  Fill these credentials
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-16 shrink-0 text-meta text-ink-tertiary">{label}</dt>
      <dd className="min-w-0 truncate font-mono text-body-sm text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-body-sm font-medium text-brand-deep">
        {label}
      </label>
      {children}
    </div>
  );
}
