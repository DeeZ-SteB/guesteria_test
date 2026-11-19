import "server-only";
import type { PreflightError } from "@/features/assistant/protocol";

/** CSRF guard for our JSON endpoints: same origin only (cookies are SameSite=Lax as well). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(body: PreflightError, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(body.retryAfter ? { "Retry-After": String(body.retryAfter) } : {}) } });
}
