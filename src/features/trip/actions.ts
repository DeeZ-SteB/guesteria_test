"use server";

import { verifiedUser } from "@/server/auth";
import { getOwnBooking, type OwnBooking } from "@/server/bookings";
import { insertGuestRequest, upsertCheckin, type RequestWriteError } from "@/server/trip";
import { todayInKyiv } from "@/lib/booking/stay";
import { checkinEligibility, requestEligibility, requestTypeAvailable, type GuestRequestView } from "@/lib/booking/trip-page";
import { fieldErrors } from "@/features/auth/schemas";
import { checkinInputSchema, guestRequestInputSchema, type CheckinView } from "./schemas";

// Only async functions may be exported from a "use server" file (see AI_LOG, stage 6).

type Common = "invalid" | "session" | "not_found" | "closed" | "retry";

async function ownBooking(bookingId: string): Promise<{ ok: true; userId: string; booking: OwnBooking } | { ok: false; reason: Common }> {
  const auth = await verifiedUser();
  if (auth.status !== "ok") return { ok: false, reason: "session" };
  let booking: OwnBooking | null;
  try {
    booking = await getOwnBooking(auth.user.id, bookingId);
  } catch {
    return { ok: false, reason: "retry" };
  }
  if (!booking) return { ok: false, reason: "not_found" }; // also for other users' ids
  return { ok: true, userId: auth.user.id, booking };
}

const stayOf = (b: OwnBooking) => ({ status: b.status, checkIn: b.check_in, checkOut: b.check_out });

export type SaveCheckinResult = { ok: true; checkin: CheckinView } | { ok: false; reason: Common; fieldErrors?: Record<string, string> };

/** Online check-in: arrival time and wishes, until the end of the arrival day (Kyiv). */
export async function saveCheckin(input: { bookingId: string; arrivalTime: string; notes?: string }): Promise<SaveCheckinResult> {
  const parsed = checkinInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const own = await ownBooking(parsed.data.bookingId);
  if (!own.ok) return own;
  if (!checkinEligibility(stayOf(own.booking), todayInKyiv()).ok) return { ok: false, reason: "closed" };
  return upsertCheckin(parsed.data);
}

export type CreateRequestResult =
  | { ok: true; request: GuestRequestView }
  | { ok: false; reason: Common | RequestWriteError | "type_closed"; fieldErrors?: Record<string, string> };

/** A request to the hotel. Idempotent per requestId (generated when the form opens). */
export async function createGuestRequest(input: { requestId: string; bookingId: string; type: string; details?: string }): Promise<CreateRequestResult> {
  const parsed = guestRequestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", fieldErrors: fieldErrors(parsed.error) };
  const own = await ownBooking(parsed.data.bookingId);
  if (!own.ok) return own;
  const today = todayInKyiv();
  const stay = stayOf(own.booking);
  if (!requestEligibility(stay, today).ok) return { ok: false, reason: "closed" };
  if (!requestTypeAvailable(parsed.data.type, stay, today)) return { ok: false, reason: "type_closed" };
  return insertGuestRequest(own.userId, parsed.data);
}
