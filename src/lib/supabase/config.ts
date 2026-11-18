/**
 * Fixed auth cookie name. By default @supabase/ssr derives the cookie name from
 * the Supabase URL hostname, which differs between the browser (localhost) and
 * the Next.js server running in Docker (host.docker.internal). A fixed name keeps
 * the session readable on both sides.
 */
export const AUTH_COOKIE_NAME = "sb-guesteria-auth-token";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.`);
  }
  return value;
}

/** URL and public key for code that runs in the browser. */
export function publicSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

/**
 * URL and public key for server code. Inside Docker, `localhost` points at the
 * container itself, so SUPABASE_INTERNAL_URL lets the server reach Supabase on
 * the host while the browser keeps using the public URL.
 */
export function serverSupabaseConfig() {
  const { url, key } = publicSupabaseConfig();
  return { url: process.env.SUPABASE_INTERNAL_URL || url, key };
}
