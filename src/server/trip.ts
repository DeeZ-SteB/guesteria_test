import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { GuestRequestView } from "@/lib/booking/trip-page";
import {
  checkinRowSchema,
  GUEST_REQUEST_COLUMNS,
  guestRequestRowSchema,
  type CheckinInput,
  type CheckinView,
  type GuestRequestInput,
} from "@/features/trip/schemas";

/**
 * Check-in and guest requests. Runs as the user (RLS is the second guard; callers have already
 * checked ownership and eligibility). Stage 8 assistant tools reuse these functions.
 */

export async function getCheckin(userId: string, bookingId: string): Promise<CheckinView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("arrival_time, notes, completed_at")
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`checkin read failed (${error.code})`);
  return data ? checkinRowSchema.parse(data) : null;
}

export async function listGuestRequests(userId: string, bookingId: string): Promise<GuestRequestView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guest_requests")
    .select(GUEST_REQUEST_COLUMNS)
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`requests read failed (${error.code})`);
  return (data ?? []).flatMap((row) => {
    const parsed = guestRequestRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export type WriteError = "closed" | "retry";

export async function upsertCheckin(input: CheckinInput): Promise<{ ok: true; checkin: CheckinView } | { ok: false; reason: WriteError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checkins")
    .upsert({ booking_id: input.bookingId, arrival_time: input.arrivalTime, notes: input.notes || null }, { onConflict: "booking_id" })
    .select("arrival_time, notes, completed_at")
    .single();
  if (error) return { ok: false, reason: error.code === "42501" ? "closed" : "retry" };
  return { ok: true, checkin: checkinRowSchema.parse(data) };
}

export type RequestWriteError = WriteError | "duplicate_open" | "limit";

export async function insertGuestRequest(
  userId: string,
  input: GuestRequestInput,
): Promise<{ ok: true; request: GuestRequestView } | { ok: false; reason: RequestWriteError }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guest_requests")
    .insert({ id: input.requestId, booking_id: input.bookingId, type: input.type, details: input.details || null })
    .select(GUEST_REQUEST_COLUMNS)
    .single();
  if (!error) return { ok: true, request: guestRequestRowSchema.parse(data) };

  if (error.code === "23505") {
    // Same requestId again (double click, retry): the first insert won — return it.
    const { data: existing } = await supabase
      .from("guest_requests")
      .select(GUEST_REQUEST_COLUMNS)
      .eq("id", input.requestId)
      .eq("user_id", userId)
      .maybeSingle();
    const parsed = guestRequestRowSchema.safeParse(existing);
    if (parsed.success) return { ok: true, request: parsed.data };
    return { ok: false, reason: "duplicate_open" };
  }
  if (error.code === "P0001") return { ok: false, reason: "limit" };
  if (error.code === "42501") return { ok: false, reason: "closed" };
  return { ok: false, reason: "retry" };
}

/** Which of these bookings already have a check-in (cabinet badge). */
export async function listCheckedInIds(userId: string, bookingIds: string[]): Promise<Set<string>> {
  if (bookingIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase.from("checkins").select("booking_id").eq("user_id", userId).in("booking_id", bookingIds);
  if (error) throw new Error(`checkins list failed (${error.code})`);
  return new Set((data ?? []).map((r) => r.booking_id as string));
}
