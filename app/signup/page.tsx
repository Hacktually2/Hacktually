import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CHECKOUT_COOKIE, readCheckoutPass } from "@/auth/checkout";
import { getSession } from "@/lib/session";
import { Wordmark } from "@/components/marketing/site-chrome";
import { ButtonLink } from "@/components/ui/button";
import { Check, Info } from "@/components/ui/icons";
import { PageHeader, Panel } from "@/components/ui/panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Choose an email and password for your new workspace.",
};

export default async function SignUpPage() {
  if (await getSession()) redirect("/projects");

  // The pass is what makes this page reachable. Without it this would be an
  // open form that grants the owner role to anyone who finds the URL.
  const plan = readCheckoutPass((await cookies()).get(CHECKOUT_COOKIE)?.value);

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="DemandX home">
          <Wordmark priority />
        </Link>
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-10 max-w-lg animate-enter">
        {plan ? (
          <>
            <PageHeader
              title="Create your workspace"
              description="One account, and you are the owner of it."
              context={
                <>
                  {plan.name} · {plan.price} {plan.cadence} · {plan.branches}
                </>
              }
            />

            <div className="mt-8">
              <SignUpForm />
            </div>

            <div className="mt-6 flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
              <Info size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
              <p className="text-body-sm leading-relaxed text-ink-secondary">
                Your address is not verified in this prototype, so use one you can remember —
                it is how you sign back in.
              </p>
            </div>

            <ul className="mt-6 space-y-2 border-t border-border-subtle pt-5">
              {[
                "Upload a CSV and confirm what its columns mean",
                "Invite managers and grant them named branches",
                "Approve or decline access requests",
              ].map((point) => (
                <li key={point} className="flex gap-2.5 text-body-sm text-ink-secondary">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-blue-ink" />
                  {point}
                </li>
              ))}
            </ul>
          </>
        ) : (
          /* No pass: not an error to apologise for, just the wrong door. */
          <Panel title="Choose a plan first">
            <p className="text-body-sm leading-relaxed text-ink-secondary">
              Workspaces are created from checkout, so this page needs a plan behind it. If
              you were part-way through, the link has expired — pick a plan again and it
              takes a moment.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ButtonLink href="/#pricing">See plans</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                I already have an account
              </ButtonLink>
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}
