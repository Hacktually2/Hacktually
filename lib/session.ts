/**
 * Re-export so the app shell keeps importing sessions from one place.
 *
 * The real implementation moved to `auth/session.ts` when sign-in stopped
 * being a demo switch and became a signed cookie over a real user table.
 */
export {
  SESSION_COOKIE,
  getSession,
  requireForecastAccess,
  requireOwner,
  requireProjectAccess,
  requireSession,
} from "@/auth/session";
export type { AuthUser, Branch, Project, Role } from "@/auth/db";
