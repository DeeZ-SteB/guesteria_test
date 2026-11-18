import "server-only";
import { createAdminClient } from "@/server/db/admin";
import { createClient } from "@/lib/supabase/server";

export type NewBooking = {
  userId: string;
  liteapiBookingId: string;
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
  refundableUntil: string | null;
};

export type OwnBooking = {
  id: string;
  liteapi_booking_id: string;
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
  refundable_until: string | null;
  status: string;
};

const OWN_COLUMNS =
  "id, liteapi_booking_id, hotel_id, hotel_name, hotel_image, city, check_in, check_out, adults, room_name, board, total_amount, currency, refundable_until, status";

/** Our booking id for a reference already saved for this user (idempotent confirm). */
export async function findOwnByReference(userId: string, clientReference: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id")
    .eq("client_reference", clientReference)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`bookings lookup failed (${error.code})`);
  return data?.id ?? null;
}

/** Writes a confirmed booking once (unique client_reference) and returns our id. */
export async function insertBooking(b: NewBooking): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.from("bookings").upsert(
    {
      user_id: b.userId,
      liteapi_booking_id: b.liteapiBookingId,
      client_reference: b.clientReference,
      prebook_id: b.prebookId,
      hotel_id: b.hotelId,
      hotel_name: b.hotelName.slice(0, 200),
      hotel_image: b.hotelImage,
      city: b.city,
      check_in: b.checkIn,
      check_out: b.checkOut,
      adults: b.adults,
      room_name: b.roomName.slice(0, 200),
      board: b.board,
      total_amount: b.totalAmount,
      currency: b.currency,
      refundable_until: b.refundableUntil,
      status: "confirmed",
    },
    { onConflict: "client_reference", ignoreDuplicates: true },
  );
  if (error) throw new Error(`bookings insert failed (${error.code})`);
  const id = await findOwnByReference(b.userId, b.clientReference);
  if (!id) throw new Error("bookings insert not visible");
  return id;
}

/** A booking of the signed-in user (RLS + explicit filter), or null. */
export async function getOwnBooking(userId: string, id: string): Promise<OwnBooking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").select(OWN_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) return null;
  return (data as OwnBooking | null) ?? null;
}

/** Does the user already hold a confirmed booking for this hotel and stay? (warning banner) */
export async function findSameStay(userId: string, hotelId: string, checkIn: string, checkOut: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", userId)
    .eq("hotel_id", hotelId)
    .eq("check_in", checkIn)
    .eq("check_out", checkOut)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
