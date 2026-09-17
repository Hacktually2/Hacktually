import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Session } from "@/app/dummy-data/types";

/**
 * Demo session.
 *
 * The backend deliberately ships no auth (architecture.md §"Not building"), so
 * this is a signed-out/signed-in switch only — it is NOT a security boundary
 * and must be replaced before anything real is behind it. It exists because the
 * logged-out and logged-in products are genuinely different surfaces.
 */
export const SESSION_COOKIE = "hkt_session";

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<Session>;
    if (!parsed.email || !parsed.name) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

/** For pages that only exist for a signed-in user. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function encodeSession(session: Session): string {
  return btoa(JSON.stringify(session));
}
