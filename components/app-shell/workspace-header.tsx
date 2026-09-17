import Link from "next/link";
import type { Session } from "@/app/dummy-data/types";
import { AccountMenu } from "./account-menu";
import { Wordmark } from "@/components/marketing/site-chrome";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function WorkspaceHeader({
  session,
  activityCount,
}: {
  session: Session;
  activityCount: number;
}) {
  return (
    <header className="glass-navigation sticky top-0 z-[var(--z-nav)]">
      <div className="layout-shell flex h-14 items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/projects" aria-label="All projects">
            <Wordmark priority />
          </Link>
          <span className="hidden h-5 w-px bg-border-default sm:block" />
          <Link
            href="/projects"
            className="hidden rounded-sm px-2 py-1 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep sm:block"
          >
            Back to Projects
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountMenu session={session} activityCount={activityCount} />
        </div>
      </div>
    </header>
  );
}
