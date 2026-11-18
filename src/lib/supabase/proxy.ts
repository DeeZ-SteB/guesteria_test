import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, serverSupabaseConfig } from "./config";

/**
 * Refreshes the Supabase session cookie on every matched request and reports
 * whether the request carries a valid session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = serverSupabaseConfig();
  /** Headers Supabase requires alongside auth cookies (e.g. Cache-Control: private, no-store). */
  const authHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.assign(authHeaders, headers);
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Validates the JWT and triggers a refresh when it is close to expiry.
  const { data } = await supabase.auth.getClaims();

  return { response, authHeaders, isSignedIn: Boolean(data?.claims?.sub) };
}
