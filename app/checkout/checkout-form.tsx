"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { completeCheckout, type CheckoutState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "@/components/ui/icons";

const INITIAL: CheckoutState = { error: null };

/**
 * The simulated purchase.
 *
 * The plan travels as a hidden field but the server resolves it against its own
 * list, so an edited value picks nothing rather than inventing a plan. There is
 * no card field here by design — see `auth/checkout.ts`.
 */
export function CheckoutForm({ planId, planName }: { planId: string; planName: string }) {
  const [state, action] = useActionState(completeCheckout, INITIAL);

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="plan" value={planId} />

      {state.error && (
        <p
          className="mb-4 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Submit planName={planName} />
    </form>
  );
}

function Submit({ planName }: { planName: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : `Continue with ${planName}`}
        {!pending && <ArrowRight size={18} />}
      </Button>
      <p className="mt-3 text-meta text-ink-tertiary" aria-live="polite">
        {pending ? "One moment." : "Next: choose your email and password. No card required."}
      </p>
    </>
  );
}
