/**
 * Display preferences.
 *
 * Each one is applied as an attribute on <html> and read back by CSS, so a
 * preference costs no React state and no re-render. Values are mirrored into
 * localStorage and re-applied before first paint by the inline script in
 * app/layout.tsx, which must be kept in step with the keys below.
 *
 * Deliberately client-only: these are per-device display choices, not account
 * settings, so they do not belong in a session or a database.
 */
export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type Motion = "system" | "reduce";

export const PREF_KEYS = {
  theme: "demandx-theme",
  density: "demandx-density",
  motion: "demandx-motion",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the change still applies to this page view.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/* -------------------------------------------------------------------- theme */

export function getTheme(): Theme {
  const stored = read(PREF_KEYS.theme);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setTheme(theme: Theme) {
  // "system" is stored as the absence of a preference, which is also what the
  // inline script checks for when it decides whether to follow the OS.
  write(PREF_KEYS.theme, theme === "system" ? null : theme);
  const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

/* ------------------------------------------------------------------ density */

export function getDensity(): Density {
  return read(PREF_KEYS.density) === "compact" ? "compact" : "comfortable";
}

export function setDensity(density: Density) {
  write(PREF_KEYS.density, density === "compact" ? "compact" : null);
  const root = document.documentElement;
  if (density === "compact") root.setAttribute("data-density", "compact");
  else root.removeAttribute("data-density");
}

/* ------------------------------------------------------------------- motion */

export function getMotion(): Motion {
  return read(PREF_KEYS.motion) === "reduce" ? "reduce" : "system";
}

export function setMotion(motion: Motion) {
  write(PREF_KEYS.motion, motion === "reduce" ? "reduce" : null);
  const root = document.documentElement;
  // "system" removes the override rather than forcing motion on, so the OS
  // setting still wins for anyone who asked for less of it.
  if (motion === "reduce") root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
}
