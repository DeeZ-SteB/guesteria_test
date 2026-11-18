import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
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
