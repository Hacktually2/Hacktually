import Link from "next/link";
import type { Session } from "@/app/dummy-data/types";
import { ButtonLink } from "@/components/ui/button";
import { ChevronDown } from "@/components/ui/icons";

/** Wordmark. Geometric, quiet, no glow. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="var(--color-brand-deep)" />
        <path
          d="M6 16.5 10 11l3.2 3.4L18 7.5"
          fill="none"
          stroke="var(--color-brand-pale)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="text-section font-bold tracking-tight text-brand-deep">Hacktually</span>
      )}
    </span>
  );
}

const NAV = [
  { href: "/#platform", label: "Platform" },
  { href: "/#workflow", label: "How it works" },
  { href: "/#calendar", label: "Indonesian demand" },
  { href: "/#deployment", label: "Deployment" },
];

/**
 * Public site header.
 *
 * Glass belongs to the navigation layer (design.md §17), so this is one of the
 * few surfaces that uses it. The signed-in state changes the call to action
 * rather than hiding the page — a returning customer reaching the marketing
 * site should be one click from their workspace.
 */
export function SiteHeader({ session }: { session: Session | null }) {
  return (
    <header className="glass-navigation sticky top-0 z-[var(--z-nav)]">
      <div className="layout-shell flex h-14 items-center justify-between gap-6">
        <Link href="/" className="shrink-0" aria-label="Hacktually home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm px-3 py-2 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {session ? (
            <>
              <span className="hidden text-body-sm text-ink-secondary lg:inline">
                {session.organisation}
              </span>
              <ButtonLink href="/projects" size="sm">
                Go to workspace
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/login" size="sm">
                Request a demo
              </ButtonLink>
            </>
          )}

          {/* Mobile nav: native disclosure, no JavaScript. */}
          <details className="relative md:hidden">
            <summary
              className="flex size-8 cursor-pointer list-none items-center justify-center rounded-sm text-brand-deep hover:bg-brand-pale-soft"
              aria-label="Open menu"
            >
              <ChevronDown size={18} />
            </summary>
            <nav
              className="glass-overlay absolute right-0 z-[var(--z-popover)] mt-2 w-56 rounded-md p-2"
              aria-label="Main"
            >
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-sm px-3 py-2 text-body-sm font-medium text-brand-deep hover:bg-brand-pale-soft"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-card">
      <div className="layout-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-body-sm text-ink-secondary">
            Demand forecasting and inventory decision support for Indonesian manufacturers and
            distributors.
          </p>
        </div>
        <FooterColumn
          title="Platform"
          links={[
            { href: "/#platform", label: "Overview" },
            { href: "/#workflow", label: "How it works" },
            { href: "/#calendar", label: "Indonesian demand calendar" },
          ]}
        />
        <FooterColumn
          title="Deployment"
          links={[
            { href: "/#deployment", label: "Sovereign hosting" },
            { href: "/#deployment", label: "Data residency" },
            { href: "/#deployment", label: "Integrations" },
          ]}
        />
        <FooterColumn
          title="Access"
          links={[
            { href: "/login", label: "Sign in" },
            { href: "/login", label: "Request a demo" },
          ]}
        />
      </div>
      <div className="layout-shell flex flex-col gap-2 border-t border-border-subtle py-5 text-meta text-ink-tertiary sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Hacktually. Data processed and stored in Indonesia.</p>
        <p>Prototype build · figures shown are from a demonstration dataset.</p>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-body-sm text-ink-secondary transition-colors duration-(--duration-fast) hover:text-brand-blue"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
