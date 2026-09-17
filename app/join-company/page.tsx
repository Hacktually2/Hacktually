import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ownerOfCompanyToken } from "@/auth/db";
import { getSession } from "@/lib/session";
import { Wordmark } from "@/components/marketing/site-chrome";
import { Check, Shield } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/panel";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { JoinCompanyForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join a company",
  description: "Join your company's workspace with the token your owner gave you.",
};

export default async function JoinCompanyPage({
  searchParams,
}: PageProps<"/join-company">) {
  if (await getSession()) redirect("/projects");

  const query = await searchParams;
  const raw = Array.isArray(query.token) ? query.token[0] : query.token;
  // Resolved only to greet them by company name. An invalid token is not
  // reported here — the form says so on submit, so this page cannot be used to
  // test tokens by watching the page change.
  const owner = raw ? ownerOfCompanyToken(raw) : null;

  return (
    <main className="layout-shell flex-1 py-10">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="DemandX home">
          <Wordmark priority />
        </Link>
        <ThemeToggle />
      </div>

      <div className="mx-auto mt-10 max-w-lg animate-enter">
        <PageHeader
          title={owner ? `Join ${owner.organisation}` : "Join your company"}
          description="Your owner gave you a company token. Use it to create your manager account — there is nothing to pay."
        />

        <div className="mt-8">
          <JoinCompanyForm defaultToken={raw ?? ""} />
        </div>

        <div className="mt-6 flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
          <Shield size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
          <p className="text-body-sm leading-relaxed text-ink-secondary">
            Joining puts you in the company. It does not give you any branch yet — you pick
            the branches you run and your owner approves them.
          </p>
        </div>

        <ul className="mt-6 space-y-2 border-t border-border-subtle pt-5">
          {[
            "See the branches in your company's projects",
            "Request the ones you manage, with a note",
            "Read demand and order lists for the branches you are approved for",
          ].map((point) => (
            <li key={point} className="flex gap-2.5 text-body-sm text-ink-secondary">
              <Check size={16} className="mt-0.5 shrink-0 text-brand-blue-ink" />
              {point}
            </li>
          ))}
        </ul>

        <p className="mt-6 text-body-sm text-ink-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-blue-ink hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
