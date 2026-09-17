import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/marketing/site-chrome";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Check } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import { DEMO_ACCOUNTS } from "@/auth/db";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your forecasting workspace.",
};

export default async function LoginPage() {
  // Already signed in: send them to the work, not back through the door.
  if (await getSession()) redirect("/projects");

  return (
    <main className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-enter">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="DemandX home">
              <Wordmark priority />
            </Link>
            <ThemeToggle />
          </div>
          <h1 className="mt-10 text-page font-bold text-brand-deep">Sign in</h1>
          <p className="mt-1.5 mb-8 text-body text-ink-secondary">
            Access your forecasting workspace and current inventory position.
          </p>
          <LoginForm
            demoAccounts={DEMO_ACCOUNTS.map((a) => ({
              email: a.email,
              password: a.password,
              name: a.name,
              role: a.role,
              blurb: a.blurb,
            }))}
          />
        </div>
      </div>

      {/* Context panel — what is behind the door, stated plainly. */}
      <aside className="hidden animate-enter border-l border-border-subtle bg-surface-card [--enter-delay:120ms] lg:flex lg:flex-col lg:justify-center lg:px-16">
        <p className="text-meta font-semibold tracking-[0.12em] text-brand-blue-ink uppercase">
          Inside the workspace
        </p>
        <h2 className="mt-3 max-w-md text-display font-bold tracking-tight text-brand-deep">
          The week&rsquo;s decisions, already ranked.
        </h2>
        <ul className="mt-8 max-w-md space-y-4">
          {[
            {
              t: "Situational overview",
              d: "Expected demand, inventory posture and the exceptions that need a decision.",
            },
            {
              t: "Demand and forecast investigation",
              d: "History against forecast, uncertainty, accuracy and demand-pattern analysis.",
            },
            {
              t: "Inventory actions with reasoning",
              d: "Recommended order quantities broken down line by line, never as a black box.",
            },
          ].map((item) => (
            <li key={item.t} className="flex gap-3">
              <Check size={18} className="mt-0.5 shrink-0 text-brand-blue-ink" />
              <div>
                <p className="text-body font-semibold text-brand-deep">{item.t}</p>
                <p className="mt-0.5 text-body-sm leading-relaxed text-ink-secondary">{item.d}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-md border-t border-border-subtle pt-6 text-meta text-ink-tertiary">
          Deploys to Indonesian cloud infrastructure. Mapping decisions and forecast runs
          are recorded for audit.
        </p>
      </aside>
    </main>
  );
}
