import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isProtectedPath, signInRedirectPath } from "@/lib/auth-routes";

export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);

  // Optimistic gate only: protected pages still verify the session themselves.
  if (!isSignedIn && isProtectedPath(request.nextUrl.pathname)) {
    const target = new URL(
      signInRedirectPath(request.nextUrl.pathname + request.nextUrl.search),
      request.url,
    );
    const redirect = NextResponse.redirect(target);
    // Keep any cookie changes made while refreshing (e.g. clearing an expired session).
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  // Skip static assets, images and the health check.
  matcher: [
    "/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
