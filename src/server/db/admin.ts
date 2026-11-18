import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverSupabaseConfig } from "@/lib/supabase/config";
import { supabaseSecretKey } from "@/server/env";

/**
 * Supabase client with the secret key: bypasses RLS. Used for exactly one thing — writing a
 * booking after LiteAPI confirmed it (clients have no insert rights on `bookings`).
 * ESLint restricts importing this module to src/server/bookings.ts.
 */
export function createAdminClient() {
  return createClient(serverSupabaseConfig().url, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
