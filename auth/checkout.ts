/**
 * Plans, and the gate between paying and getting an owner account.
 *
 * Deliberately NOT a `"use server"` module: every export of one of those is a
 * public endpoint, and `issueCheckoutPass` must never be callable on its own —
 * it is the thing that authorises creating an owner.
 *
 * ## No payment is taken
 *
 * This is an MVP with no payment processor wired up. Checkout is a simulated
 * step and the UI says so on the screen where it happens. There is no card
 * field anywhere in this flow, on purpose: a mock form that asks for a card
 * number looks exactly like a real one in a screenshot, and someone eventually
 * types a real number into it. When a processor is added (Midtrans or Xendit
 * for this market), its webhook replaces `issueCheckoutPass` and nothing else
 * in the flow has to change.
 *
 * ## Why there is a pass at all
 *
 * Sign-up creates an **owner** — the role that holds a project and decides who
 * sees which branch. An open sign-up page would let anyone self-grant that. So
 * checkout issues a short-lived signed pass, and the sign-up action refuses
 * without one. It is the same HMAC the session cookie uses, so a forged pass is
 * rejected rather than believed.
 */
import { sign } from "./db.ts";

export interface Plan {
  id: string;
  name: string;
  /** Preformatted so server and client render identical strings. */
  price: string;
  cadence: string;
  tagline: string;
  branches: string;
  features: string[];
  /** The one plan the pricing table leads with. */
  featured?: boolean;
  /** A plan you cannot buy from a web form. */
  contactOnly?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "cabang",
    name: "Cabang",
    price: "Rp 9.000.000",
    cadence: "per month",
    tagline: "One branch, one planner.",
    branches: "1 branch",
    features: [
      "Up to 2.000 series",
      "30-day forecast horizon",
      "Data health report and column mapping",
      "Reorder recommendations with the reasoning",
    ],
  },
  {
    id: "jaringan",
    name: "Jaringan",
    price: "Rp 18.000.000",
    cadence: "per month",
    tagline: "A branch network, with a manager per branch.",
    branches: "Up to 10 branches",
    featured: true,
    features: [
      "Up to 20.000 series",
      "Branch access: managers see only their own branches",
      "Access requests, approved by the owner",
      "Scenario simulation and planning parameters",
    ],
  },
  {
    id: "nasional",
    name: "Nasional",
    price: "Rp 40.000.000",
    cadence: "per month",
    tagline: "A national network, read one branch at a time.",
    branches: "Up to 40 branches",
    features: [
      "Unlimited series",
      "Everything in Jaringan",
      "MCP server for agent workflows",
      "Slack or WhatsApp procurement alerts",
      "Priority support",
    ],
  },
  {
    id: "korporat",
    name: "Korporat",
    price: "Custom",
    cadence: "annual",
    tagline: "Every branch, and your own infrastructure.",
    branches: "Unlimited branches",
    contactOnly: true,
    features: [
      "Deploys to your own Indonesian cloud tenancy",
      "Single sign-on and audit export",
      "Named support engineer",
      "Contractual data residency",
    ],
  },
];

export const findPlan = (id: string): Plan | undefined =>
  PLANS.find((plan) => plan.id === id && !plan.contactOnly);

/* -------------------------------------------------------------- the pass */

export const CHECKOUT_COOKIE = "hkt_checkout";

/** Long enough to fill in a form, short enough that a stale tab is not a key. */
const PASS_TTL_MS = 30 * 60 * 1000;

export function issueCheckoutPass(planId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ plan: planId, exp: Date.now() + PASS_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The plan a valid pass was issued for, or null. Never throws on junk input. */
export function readCheckoutPass(token: string | undefined): Plan | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const { plan, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as { plan?: string; exp?: number };
    if (!plan || !exp || exp < Date.now()) return null;
    return findPlan(plan) ?? null;
  } catch {
    return null;
  }
}
