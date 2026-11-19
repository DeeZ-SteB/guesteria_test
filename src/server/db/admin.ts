import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serverSupabaseConfig } from "@/lib/supabase/config";

/**
 * Supabase client with the secret key: bypasses RLS. Used only by src/server/bookings.ts (to record
 * booking attempts, confirmations and cancellations; clients cannot write `bookings`) and
 * src/server/users.ts (account deletion).
 * The key is read here and nowhere else; ESLint restricts importing this module.
 */
export function createAdminClient() {
  const key = z.string().min(20).safeParse(process.env.SUPABASE_SECRET_KEY);
  if (!key.success) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createClient(serverSupabaseConfig().url, key.data, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
