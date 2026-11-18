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

  const supabase = createServerClient(url, key, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validates the JWT and triggers a refresh when it is close to expiry.
  const { data } = await supabase.auth.getClaims();

  return { response, isSignedIn: Boolean(data?.claims?.sub) };
}
