import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isProtectedPath, signInRedirectPath } from "@/lib/auth-routes";

export async function proxy(request: NextRequest) {
  const { response, authHeaders, isSignedIn } = await updateSession(request);
  const { nextUrl } = request;

  // Signed-out visitor on a protected page → home with the auth modal open.
  // Optimistic only: protected pages still verify the session themselves.
  if (!isSignedIn && isProtectedPath(nextUrl.pathname)) {
    return redirectKeepingAuth(new URL(signInRedirectPath(nextUrl.pathname + nextUrl.search), request.url));
  }

  // Signed-in visitor with a stale ?auth= link (bookmark, back button) → drop the modal params.
  if (isSignedIn && nextUrl.searchParams.has("auth")) {
    const clean = nextUrl.clone();
    clean.searchParams.delete("auth");
    clean.searchParams.delete("next");
    return redirectKeepingAuth(clean);
  }

  return response;

  function redirectKeepingAuth(target: URL) {
    const redirect = NextResponse.redirect(target);
    // Keep cookie changes made while refreshing, plus the no-store headers that must travel with them.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    Object.entries(authHeaders).forEach(([name, value]) => redirect.headers.set(name, value));
    return redirect;
  }
}

export const config = {
  // Skip static assets, images and the health check.
  matcher: [
    "/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
