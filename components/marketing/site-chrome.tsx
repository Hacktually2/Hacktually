import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { Session } from "@/app/dummy-data/types";
import { ButtonLink } from "@/components/ui/button";
import { ChevronDown } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Re-exported so the workspace header and login screen keep one import path for
 * the brand. `compact` renders the badge alone, for tight chrome.
 */
export function Wordmark({
  compact = false,
  priority = false,
}: {
  compact?: boolean;
  priority?: boolean;
}) {
  return (
    <Logo
      variant={compact ? "badge" : "full"}
      height={compact ? 26 : 24}
      priority={priority}
    />
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
      <div className="layout-shell flex h-14 items-center justify-between gap-3 sm:gap-6">
        <Link href="/" className="shrink-0" aria-label="DemandX home">
          <Wordmark priority />
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
          <ThemeToggle />
          {session ? (
            <>
              <span className="hidden text-body-sm text-ink-secondary lg:inline">
                {session.organisation}
              </span>
              <ButtonLink href="/projects" size="sm">
                {/* The full label does not fit beside the logo on a phone. */}
                <span className="sm:hidden">Workspace</span>
                <span className="hidden sm:inline">Go to workspace</span>
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/login" size="sm">
                <span className="sm:hidden">Demo</span>
                <span className="hidden sm:inline">Request a demo</span>
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
              className="surface-popover absolute right-0 z-[var(--z-popover)] mt-2 w-56 max-w-[calc(100vw-2rem)] p-2"
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
        <p>© 2026 DemandX. Data processed and stored in Indonesia.</p>
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
              className="text-body-sm text-ink-secondary transition-colors duration-(--duration-fast) hover:text-brand-blue-ink"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
