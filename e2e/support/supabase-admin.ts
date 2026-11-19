import { createClient } from "@supabase/supabase-js";

/** Test-only admin client. Refuses anything but a local Supabase. Never bundled into the app. */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("E2E needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (local stack)");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`E2E refuses to write to a non-local Supabase (${host})`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const E2E_STATE = "e2e/.auth/run.json";
export type RunState = { userId: string; email: string; password: string; tripId: string; tripCheckIn: string };
