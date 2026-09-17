import type { Session } from "./types";

/**
 * Demo credentials.
 *
 * There is no identity provider yet (architecture.md §"Not building" excludes
 * auth beyond a demo key), so sign-in is checked against this list. It is NOT
 * security: the passwords sit in the client-side bundle's sibling server code
 * and anyone reading the repo can see them. Delete this file and replace the
 * lookup in `app/login/actions.ts` before anything real is behind the login.
 *
 * Add an entry here and it appears on the login screen automatically.
 */
export interface DemoAccount {
  email: string;
  password: string;
  session: Session;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "sari.wijaya@abcdistribution.co.id",
    password: "demo1234",
    session: {
      name: "Sari Wijaya",
      email: "sari.wijaya@abcdistribution.co.id",
      role: "Demand Planner",
      organisation: "PT ABC Distribution",
      initials: "SW",
    },
  },
];

/** Case-insensitive lookup; emails are not case sensitive in practice. */
export function findDemoAccount(email: string): DemoAccount | undefined {
  const needle = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === needle);
}
