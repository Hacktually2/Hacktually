"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "@/app/login/actions";
import { loadActivity } from "@/app/projects/actions";
import type { ActivityEvent, Session } from "@/app/dummy-data/types";
import { ChevronDown, Clock, LogOut, Settings } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { ActivityLog } from "./activity-log";
import { SettingsPanel } from "./settings-panel";

type Panel = "none" | "settings" | "activity";

/**
 * Account menu, plus the two panels it opens.
 *
 * A real button and menu rather than <details>, because opening a modal from
 * inside a disclosure leaves the disclosure open behind it and the focus order
 * goes sideways.
 *
 * Both panels are modals rather than pages: they are side tasks, and the user
 * should come back to exactly the row and filter they left (design.md §52).
 */
export function AccountMenu({
  session,
  activityCount,
}: {
  session: Session;
  /** Only the count travels with the page; entries are fetched on open. */
  activityCount: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [loadingActivity, startLoading] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Bound only while the menu is open, so
  // there is no permanent document listener.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function openPanel(next: Panel) {
    setMenuOpen(false);
    setPanel(next);
    // Fetched once per session and kept, since the log only changes when the
    // data does and any such change reloads the page anyway.
    if (next === "activity" && activity === null) {
      startLoading(async () => setActivity(await loadActivity()));
    }
  }

  return (
    <>
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-sm py-1 pr-2 pl-1 transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft"
        >
          <span
            className="flex size-8 items-center justify-center rounded-full bg-surface-brand text-meta font-bold text-ink-on-brand"
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
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="surface-popover animate-enter absolute right-0 z-[var(--z-popover)] mt-2 w-64 max-w-[calc(100vw-2rem)] p-2"
          >
            <div className="px-2 pt-1 pb-2">
              <p className="truncate text-body-sm font-semibold text-brand-deep">
                {session.name}
              </p>
              <p className="truncate text-meta text-ink-tertiary">{session.email}</p>
            </div>

            <div className="border-t border-border-subtle pt-1">
              <MenuItem icon={<Settings size={16} />} onClick={() => openPanel("settings")}>
                Settings
              </MenuItem>
              <MenuItem icon={<Clock size={16} />} onClick={() => openPanel("activity")}>
                Activity log
                {activityCount > 0 && (
                  <span
                    className="ml-auto rounded-full bg-surface-sunken px-1.5 py-0.5 text-meta font-semibold text-ink-secondary"
                    data-numeric
                  >
                    {activityCount}
                  </span>
                )}
              </MenuItem>
            </div>

            <form action={signOut} className="mt-1 border-t border-border-subtle pt-1">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      <Modal
        open={panel === "settings"}
        onClose={() => setPanel("none")}
        title="Settings"
        description="Display preferences for this browser."
      >
        {/* Rendered only while open, so it can read the current preferences
            during render without ever disagreeing with the server. */}
        {panel === "settings" && <SettingsPanel session={session} />}
      </Modal>

      <Modal
        open={panel === "activity"}
        onClose={() => setPanel("none")}
        title="Activity log"
        description="Every change to the data and to the results it produced."
      >
        {panel === "activity" &&
          (activity ? (
            <ActivityLog events={activity} />
          ) : (
            <p className="py-10 text-center text-body-sm text-ink-secondary" aria-live="polite">
              {loadingActivity ? "Loading activity…" : "No activity to show."}
            </p>
          ))}
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-body-sm font-medium text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep"
    >
      {icon}
      {children}
    </button>
  );
}
