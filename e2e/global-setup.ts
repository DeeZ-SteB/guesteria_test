import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { adminClient, E2E_STATE, type RunState } from "./support/supabase-admin";
import { kyivToday, plusDays } from "./support/dates";

/** A fresh, throwaway user per run (never the shared demo account) and one confirmed trip. */
export default async function globalSetup() {
  const db = adminClient();
  if (process.env.E2E_LIVE === "1") await assertSandboxKey();
  // Shared daily counters persist in the local DB between runs; start each run from zero.
  await db.from("rate_limits").delete().or("key.like.bookAll:%,key.like.prebookAll:%,key.like.aiAll:%,key.like.aiAnon:%");
  const runId = Date.now().toString(36);
  const email = `e2e+${runId}@guesteria.test`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Тест", last_name: "Гість" },
    app_metadata: { e2e: true },
  });
  if (error || !data.user) throw new Error(`E2E user not created: ${error?.message}`);

  // A confirmed trip for the trip-page, accessibility and layout specs.
  const checkIn = plusDays(kyivToday(), 21);
  const liteapiId = `BKSEED${runId}`.slice(0, 20);
  const { data: trip, error: tripError } = await db
    .from("bookings")
    .insert({
      user_id: data.user.id,
      liteapi_booking_id: liteapiId,
      hotel_id: "lpbbb0c",
      hotel_name: "Grand Hotel Lviv Casino & Spa",
      hotel_image: "https://static.cupid.travel/hotels/537462569.jpg",
      city: "lviv",
      check_in: checkIn,
      check_out: plusDays(checkIn, 2),
      adults: 2,
      room_name: "Double/Twin (2 People)",
      board: "BI",
      total_amount: 17766,
      currency: "UAH",
      refundable: true,
      refundable_until: `${plusDays(checkIn, -3)}T10:00:00Z`,
      status: "confirmed",
      client_reference: `gs-${randomBytes(12).toString("hex")}`,
      prebook_id: "PB-SEED",
    })
    .select("id")
    .single();
  if (tripError || !trip) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Error(`E2E trip not created: ${tripError?.message}`);
  }

  // The mock knows the seeded booking too (cancel / status lookups).
  if (process.env.E2E_LIVE !== "1") {
    const seeded = await fetch("http://127.0.0.1:8782/__seed", {
      method: "POST",
      body: JSON.stringify({ bookingId: liteapiId, hotelId: "lpbbb0c", checkIn, checkOut: plusDays(checkIn, 2) }),
    });
    if (!seeded.ok) throw new Error(`mock LiteAPI seed failed (${seeded.status})`);
  }

  mkdirSync("e2e/.auth", { recursive: true });
  const state: RunState = { userId: data.user.id, email, password, tripId: trip.id as string, tripCheckIn: checkIn };
  writeFileSync(E2E_STATE, JSON.stringify(state));
}

/**
 * The live tier books for real with the key in .env: refuse unless LiteAPI itself says the key is a
 * sandbox key (the key is never printed or inspected here).
 */
async function assertSandboxKey() {
  const res = await fetch("https://api.liteapi.travel/v3.0/hotels/min-rates", {
    method: "POST",
    headers: { "X-API-Key": process.env.LITEAPI_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify({ hotelIds: ["lpbbb0c"], checkin: plusDays(kyivToday(), 30), checkout: plusDays(kyivToday(), 31), occupancies: [{ adults: 2 }], currency: "UAH", guestNationality: "UA" }),
  });
  const body = (await res.json().catch(() => ({}))) as { sandbox?: unknown };
  if (body.sandbox !== true) throw new Error("e2e:live refuses to run: LITEAPI_KEY is not a sandbox key (or LiteAPI is unreachable)");
}
