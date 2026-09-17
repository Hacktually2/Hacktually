import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findPlan } from "@/auth/checkout";
import { getSession } from "@/lib/session";
import { Wordmark } from "@/components/marketing/site-chrome";
import { Check, Info, Shield } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your plan and create your workspace.",
};

export default async function CheckoutPage({
  searchParams,
}: PageProps<"/checkout">) {
  // Already signed in: they have a workspace, and selling them another plan
  // from a page they landed on by accident is not helpful.
  if (await getSession()) redirect("/projects");

  const query = await searchParams;
  const raw = Array.isArray(query.plan) ? query.plan[0] : query.plan;
  const plan = raw ? findPlan(raw) : undefined;
  if (!plan) notFound();

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="DemandX home">
          <Wordmark priority />
        </Link>
        <ThemeToggle />
      </div>

      <div className="mt-10 grid animate-enter gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        {/* What they are getting, restated. A checkout that hides the thing
            being bought is how people abandon one. */}
        <section className="surface-card p-6">
          <p className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
            Your plan
          </p>
          <h1 className="mt-2 text-page font-bold text-brand-deep">{plan.name}</h1>
          <p className="mt-1 text-body text-ink-secondary">{plan.tagline}</p>

          <div className="mt-6 flex items-baseline gap-2 border-y border-border-subtle py-5">
            <p className="text-metric-lg font-bold text-brand-deep" data-numeric>
              {plan.price}
            </p>
            <p className="text-body text-ink-tertiary">{plan.cadence}</p>
          </div>

          <p className="mt-5 text-body-sm font-semibold text-brand-deep">{plan.branches}</p>
          <ul className="mt-3 space-y-2.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-body-sm text-ink-secondary">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-blue-ink" />
                {feature}
              </li>
            ))}
          </ul>

          <Link
            href="/#pricing"
            className="mt-6 inline-block text-body-sm font-semibold text-brand-blue-ink hover:underline"
          >
            Compare plans
          </Link>
        </section>

        <section className="space-y-5">
          {/* Said plainly, before the button, not in the small print after it. */}
          <div className="flex gap-3 rounded-md border border-status-watch/30 bg-status-watch-surface px-4 py-3.5">
            <Info size={17} className="mt-0.5 shrink-0 text-status-watch" />
            <div className="text-body-sm leading-relaxed text-status-watch">
              <p className="font-semibold">No payment is taken.</p>
              <p className="mt-1">
                This is a prototype. There is no card field on this page and nothing is
                charged — continuing simply creates your workspace so you can try the
                product. A real checkout goes here before launch.
              </p>
            </div>
          </div>

          <div className="surface-card p-6">
            <h2 className="text-section font-semibold text-brand-deep">
              Create your workspace
            </h2>
            <p className="mt-1.5 text-body-sm leading-relaxed text-ink-secondary">
              You will be the <strong className="font-semibold text-brand-deep">owner</strong>{" "}
              of this workspace: you upload the data, and you decide which branches each
              manager can see.
            </p>
            <CheckoutForm planId={plan.id} planName={plan.name} />
          </div>

          <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
            <Shield size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
            <p className="text-body-sm leading-relaxed text-ink-secondary">
              Already have a workspace?{" "}
              <Link href="/login" className="font-semibold text-brand-blue-ink hover:underline">
                Sign in
              </Link>{" "}
              instead — a manager is invited by their owner, not through checkout.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
