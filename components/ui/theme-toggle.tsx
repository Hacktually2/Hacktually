"use client";

import { Moon, Sun } from "./icons";

/** Kept in sync with the inline script in app/layout.tsx. */
export const THEME_STORAGE_KEY = "demandx-theme";

/**
 * Light/dark switch.
 *
 * Holds no React state on purpose. The current theme lives on <html> as
 * data-theme, the icon and label are chosen in CSS from that attribute, and the
 * click handler reads the DOM rather than a copy of it.
 *
 * That avoids the usual theme-toggle hydration mismatch: the server cannot know
 * which theme the browser will use, so any server-rendered guess is wrong half
 * the time. Here the server renders both icons and the browser hides one.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the theme still applies for this
      // page view, it just will not be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex size-8 items-center justify-center rounded-sm text-ink-secondary transition-colors duration-(--duration-fast) hover:bg-brand-pale-soft hover:text-brand-deep ${
        className ?? ""
      }`}
    >
      <Sun size={17} className="theme-light-only block" />
      <Moon size={17} className="theme-dark-only" />
      <span className="sr-only theme-light-only">Switch to dark theme</span>
      <span className="sr-only theme-dark-only">Switch to light theme</span>
    </button>
  );
}
