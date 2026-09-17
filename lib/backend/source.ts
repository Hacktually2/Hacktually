import "server-only";

/**
 * Live data, or fixtures, and always a truthful answer about which.
 *
 * Every screen in this app now asks for a `Sourced<T>`: the value plus whether
 * it came from the forecasting service. When it did not, `note` says why — the
 * endpoint does not exist yet, or the service did not answer — and the screen
 * renders a badge saying so.
 *
 * The rule that makes this worth having: **a fallback is never silent**. A
 * dashboard that quietly shows fixtures is worse than one that breaks, because
 * nobody finds out until someone acts on an invented number.
 */
import { BackendError } from "./client";

export interface Sourced<T> {
  data: T;
  live: boolean;
  /** Null when live. Otherwise one sentence naming the gap. */
  note: string | null;
}

export const live = <T>(data: T): Sourced<T> => ({ data, live: true, note: null });

/**
 * For a read model the backend has no endpoint for at all.
 *
 * Nothing is attempted — there is nothing to attempt — and the note names the
 * endpoint that would replace the fixture, so the badge on screen and the gap
 * list in migration-report.md say the same thing.
 */
export const notBuilt = <T>(data: T, endpoint: string): Sourced<T> => ({
  data,
  live: false,
  note: `Demo data · ${endpoint} is not implemented in the backend yet`,
});

/**
 * Try the backend, fall back to the fixture, and say which happened.
 *
 * The failure is logged server-side with its path, because a note on screen is
 * for the person demoing and a log line is for whoever has to fix it.
 */
export async function fromBackend<T>(
  load: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<Sourced<T>> {
  try {
    return live(await load());
  } catch (error) {
    const reason =
      error instanceof BackendError
        ? `${error.userMessage} (${error.kind}: ${error.path})`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    console.warn(`[backend] falling back to fixtures — ${reason}`);
    return {
      data: await fallback(),
      live: false,
      note: `Demo data · ${
        error instanceof BackendError ? error.userMessage : "The forecasting service failed."
      }`,
    };
  }
}

/**
 * Like `fromBackend`, but for a call whose failure the caller must handle —
 * an upload, a mapping confirmation, a forecast run. A write has no fixture to
 * fall back to: pretending it succeeded would be a lie with consequences.
 */
export async function attempt<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (error instanceof BackendError) {
      console.warn(`[backend] ${error.kind} on ${error.path}: ${error.message}`);
      return { ok: false, error: error.userMessage };
    }
    console.warn("[backend] unexpected failure", error);
    return { ok: false, error: "Something went wrong talking to the forecasting service." };
  }
}
