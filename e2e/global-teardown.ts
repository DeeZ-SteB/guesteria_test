import { existsSync, readFileSync } from "node:fs";
import { adminClient, E2E_STATE, type RunState } from "./support/supabase-admin";

/** Removes everything the run created and proves the model was never called. */
export default async function globalTeardown() {
  const db = adminClient();
  if (existsSync(E2E_STATE)) {
    const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as RunState;
    // Booking rows survive account deletion (user_id → null), so delete them explicitly.
    await db.from("bookings").delete().eq("user_id", state.userId);
    await db.auth.admin.deleteUser(state.userId);
  }
  // Sweep users left by crashed runs (older than a day).
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users ?? []) {
    if (u.app_metadata?.e2e === true && Date.parse(u.created_at) < Date.now() - 86_400_000) {
      await db.from("bookings").delete().eq("user_id", u.id);
      await db.auth.admin.deleteUser(u.id);
    }
  }
  if (process.env.E2E_LIVE !== "1") {
    const stats = (await (await fetch("http://127.0.0.1:8782/__stats")).json()) as { anthropicHits: number; keyMismatches: number };
    if (stats.anthropicHits !== 0) throw new Error(`E2E reached the Anthropic API ${stats.anthropicHits} times`);
    if (stats.keyMismatches !== 0) throw new Error("The app did not use the mock LiteAPI key (env precedence broken)");
  }
}
