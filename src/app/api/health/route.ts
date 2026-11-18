import { serverSupabaseConfig } from "@/lib/supabase/config";

/** Liveness check for Docker and smoke tests. Reports whether Supabase Auth answers. */
export async function GET() {
  let supabase: "ok" | "unreachable" | "not_configured" = "not_configured";

  try {
    const { url, key } = serverSupabaseConfig();
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    supabase = res.ok ? "ok" : "unreachable";
  } catch (error) {
    supabase =
      error instanceof Error && error.message.startsWith("Missing environment")
        ? "not_configured"
        : "unreachable";
  }

  return Response.json({ status: "ok", supabase });
}
