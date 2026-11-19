import "server-only";
import { createAdminClient } from "@/server/db/admin";
import { createClient } from "@/lib/supabase/server";

export type BookingStatus = "pending" | "confirmed" | "cancelled";

/** Everything known before calling LiteAPI book (from the signed checkout token). */
export type NewAttempt = {
  userId: string;
  clientReference: string;
  prebookId: string;
  hotelId: string;
  hotelName: string;
  hotelImage: string | null;
  city: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  roomName: string;
  board: string | null;
  totalAmount: number;
  currency: string;
  /** Terms shown at checkout; tightened (never loosened) by what the booking reports. */
  refundable: boolean;
  refundableUntil: string | null;
};

export type Attempt = { id: string; status: BookingStatus; createdAt: string; liteapiBookingId: string | null };

export type OwnBooking = {
  id: string;
  liteapi_booking_id: string | null;
  hotel_id: string;
  hotel_name: string;
  hotel_image: string | null;
  city: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  room_name: string;
  board: string | null;
  total_amount: number;
  currency: string;
  refundable: boolean;
  refundable_until: string | null;
  status: BookingStatus;
  client_reference: string;
  prebook_id: string;
  created_at: string;
};

const OWN_COLUMNS =
  "id, liteapi_booking_id, hotel_id, hotel_name, hotel_image, city, check_in, check_out, adults, room_name, board, total_amount, currency, refundable, refundable_until, status, client_reference, prebook_id, created_at";

function toAttempt(row: { id: string; status: string; created_at: string; liteapi_booking_id: string | null }): Attempt {
  return { id: row.id, status: row.status as BookingStatus, createdAt: row.created_at, liteapiBookingId: row.liteapi_booking_id };
}

/** This user's attempt/booking for a reference, if any. */
export async function findOwnAttempt(userId: string, clientReference: string): Promise<Attempt | null> {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id, status, created_at, liteapi_booking_id")
    .eq("client_reference", clientReference)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`bookings lookup failed (${error.code})`);
  return data ? toAttempt(data) : null;
}

/**
 * Records the attempt BEFORE calling LiteAPI. The unique client_reference makes this a lock:
 * only the request that inserted the row may call book; everyone else resolves by lookup.
 */
export async function claimAttempt(a: NewAttempt): Promise<{ claimed: boolean; attempt: Attempt }> {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .insert({
      user_id: a.userId,
      client_reference: a.clientReference,
      prebook_id: a.prebookId,
      hotel_id: a.hotelId,
      hotel_name: a.hotelName.slice(0, 200),
      hotel_image: a.hotelImage,
      city: a.city,
      check_in: a.checkIn,
      check_out: a.checkOut,
      adults: a.adults,
      room_name: a.roomName.slice(0, 200),
      board: a.board,
      total_amount: a.totalAmount,
      currency: a.currency,
      refundable: a.refundable,
      refundable_until: a.refundableUntil,
      status: "pending",
    })
    .select("id, status, created_at, liteapi_booking_id")
    .single();
  if (!error && data) return { claimed: true, attempt: toAttempt(data) };
  if (error?.code === "23505") {
    const existing = await findOwnAttempt(a.userId, a.clientReference);
    if (existing) return { claimed: false, attempt: existing };
  }
  throw new Error(`bookings claim failed (${error?.code ?? "no row"})`);
}

/** Marks an attempt confirmed with LiteAPI's id and the cancellation terms to keep. */
export async function confirmAttempt(id: string, c: { liteapiBookingId: string; refundable: boolean; refundableUntil: string | null }): Promise<void> {
  const { error } = await createAdminClient()
    .from("bookings")
    .update({ status: "confirmed", liteapi_booking_id: c.liteapiBookingId, refundable: c.refundable, refundable_until: c.refundableUntil })
    .eq("id", id)
    .in("status", ["pending", "confirmed"]);
  if (error) throw new Error(`bookings confirm failed (${error.code})`);
}

/** Remembers LiteAPI's id on a still-pending attempt (booked but not yet CONFIRMED). */
export async function notePendingLiteApiId(id: string, liteapiBookingId: string): Promise<void> {
  await createAdminClient().from("bookings").update({ liteapi_booking_id: liteapiBookingId }).eq("id", id).eq("status", "pending");
}

/** Drops an attempt that provably produced no booking, so the guest can try again. */
export async function releaseAttempt(id: string): Promise<void> {
  await createAdminClient().from("bookings").delete().eq("id", id).eq("status", "pending");
}

/** A booking of the signed-in user (RLS + explicit filter), or null. */
export async function getOwnBooking(userId: string, id: string): Promise<OwnBooking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select(OWN_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) return null;
  return (data as OwnBooking | null) ?? null;
}

/** A confirmed or in-flight booking for this hotel and stay (warning banner). */
export async function findSameStay(userId: string, hotelId: string, checkIn: string, checkOut: string): Promise<{ id: string; status: BookingStatus } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("user_id", userId)
    .eq("hotel_id", hotelId)
    .eq("check_in", checkIn)
    .eq("check_out", checkOut)
    .in("status", ["confirmed", "pending"])
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, status: data.status as BookingStatus } : null;
}
