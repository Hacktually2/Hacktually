import Link from "next/link";
import type { Session } from "@/app/dummy-data/types";
import { Wordmark } from "@/components/marketing/site-chrome";
import { ChevronDown, LogOut } from "@/components/ui/icons";
import { signOut } from "@/app/login/actions";

export function WorkspaceHeader({ session }: { session: Session }) {
  return (
    <header className="glass-navigation sticky top-0 z-[var(--z-nav)]">
      <div className="layout-shell flex h-14 items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/projects" aria-label="All projects">
            <Wordmark />
          </Link>
          <span className="hidden h-5 w-px bg-border-default sm:block" />
          <Link
            href="/projects"
            className="hidden rounded-sm px-2 py-1 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep sm:block"
          >
            Back to Projects
          </Link>
        </div>

        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm py-1 pr-2 pl-1 hover:bg-brand-pale-soft">
            <span
              className="flex size-8 items-center justify-center rounded-full bg-brand-deep text-meta font-bold text-ink-on-brand"
              aria-hidden="true"
            >
              {session.initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-body-sm leading-tight font-semibold text-brand-deep">
                {session.name}
              </span>
              <span className="block text-meta leading-tight text-ink-tertiary">
                {session.organisation}
              </span>
            </span>
            <ChevronDown size={16} className="text-ink-tertiary" />
          </summary>

          <div className="glass-overlay absolute right-0 z-[var(--z-popover)] mt-2 w-64 rounded-md p-3">
            <p className="text-body-sm font-semibold text-brand-deep">{session.name}</p>
            <p className="text-meta text-ink-tertiary">{session.email}</p>
            <p className="mt-2 text-meta text-ink-secondary">
              {session.role} · {session.organisation}
            </p>
            <form action={signOut} className="mt-3 border-t border-border-subtle pt-3">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
