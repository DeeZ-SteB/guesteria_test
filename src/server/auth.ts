import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { initials } from "@/lib/initials";
import { signInRedirectPath } from "@/lib/auth-routes";
import { safeReturnTo } from "@/lib/return-to";

/** The only user shape that leaves the data access layer. */
export type ShellUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
};

function metaString(meta: unknown, key: string): string {
  if (typeof meta !== "object" || meta === null) return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/**
 * Current user from the verified session JWT, or null. Deduplicated per request.
 * Must be called inside a <Suspense> boundary (it reads cookies).
 */
export const getCurrentUser = cache(async (): Promise<ShellUser | null> => {
  // The session is per request, and Supabase checks token expiry with Date.now(),
  // which Next.js forbids during prerendering. Opt into request-time rendering first.
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const email = typeof claims.email === "string" ? claims.email : "";
  const firstName = metaString(claims.user_metadata, "first_name");
  const lastName = metaString(claims.user_metadata, "last_name");

  return {
    id: claims.sub,
    email,
    firstName,
    lastName,
    initials: initials({ firstName, lastName, email }),
  };
});

/** Use in protected pages. Signed-out visitors land on the home page with the auth modal open. */
export async function requireUser(returnTo: string): Promise<ShellUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInRedirectPath(safeReturnTo(returnTo)));
  return user;
}

export type VerifiedUser = { status: "ok"; user: ShellUser; isDemo: boolean; emailConfirmed: boolean } | { status: "session" };

/**
 * For actions that spend money or change the account: re-checks the session with the Auth server
 * (a revoked JWT still passes getClaims until it expires). `isDemo` comes from app_metadata,
 * which only the secret key can write.
 */
export async function verifiedUser(): Promise<VerifiedUser> {
  const current = await getCurrentUser();
  if (!current) return { status: "session" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== current.id) return { status: "session" };
  return {
    status: "ok",
    user: current,
    isDemo: data.user.app_metadata?.demo === true,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
}

/** Booking additionally requires a confirmed email. */
export async function verifiedBookingUser(): Promise<{ status: "ok"; user: ShellUser } | { status: "session" | "unverified" }> {
  const v = await verifiedUser();
  if (v.status !== "ok") return v;
  if (!v.emailConfirmed) return { status: "unverified" };
  return { status: "ok", user: v.user };
}

const profileMetaSchema = z.object({
  first_name: z.string().max(50).catch(""),
  last_name: z.string().max(50).catch(""),
  phone: z.string().max(20).catch(""),
  ai_language: z.enum(["auto", "uk", "en"]).catch("auto"),
});

export type AccountProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  aiLanguage: "auto" | "uk" | "en";
  email: string;
  isDemo: boolean;
};

/**
 * Profile for the cabinet form. user_metadata is writable by the user through the Supabase API,
 * so it is parsed defensively and never used for authorization.
 */
export async function getAccountProfile(): Promise<AccountProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const meta = profileMetaSchema.parse(typeof claims?.user_metadata === "object" && claims.user_metadata ? claims.user_metadata : {});
  const appMeta = claims?.app_metadata as Record<string, unknown> | undefined;
  return {
    firstName: meta.first_name,
    lastName: meta.last_name,
    phone: meta.phone,
    aiLanguage: meta.ai_language,
    email: user.email,
    // UI hint only; every action re-checks via verifiedUser().
    isDemo: appMeta?.demo === true,
  };
}
