"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findDemoAccount } from "@/app/dummy-data/accounts";
import { SESSION_COOKIE, encodeSession } from "@/lib/session";

export type SignInState = { error: string | null };

/**
 * Demo sign-in, checked against the hardcoded accounts in
 * `app/dummy-data/accounts.ts`. Replace wholesale when real auth lands —
 * nothing else in the app reads the cookie directly.
 */
export async function signIn(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { error: "Enter a valid work email address." };
  }

  const account = findDemoAccount(email);

  // One message for both a wrong address and a wrong password, so the form
  // never confirms which addresses exist.
  if (!account || account.password !== password) {
    return { error: "Email or password is not recognised." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(account.session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/projects");
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}
