import type { OwnBooking } from "@/server/bookings";
import { cancelEligibility, type TripRow } from "@/lib/booking/trips";

/** Only display fields cross to the client: no client_reference, prebook or LiteAPI ids. */
export function toTripRow(b: OwnBooking, now: Date): TripRow {
  const terms = {
    status: b.status,
    checkIn: b.check_in,
    refundable: b.refundable,
    refundableUntil: b.refundable_until,
    hasLiteApiId: b.liteapi_booking_id !== null,
  };
  return {
    id: b.id,
    status: b.status,
    hotelId: b.hotel_id,
    hotelName: b.hotel_name,
    hotelImage: b.hotel_image,
    city: b.city,
    checkIn: b.check_in,
    checkOut: b.check_out,
    adults: b.adults,
    roomName: b.room_name,
    totalAmount: Number(b.total_amount),
    currency: b.currency,
    refundable: b.refundable,
    refundableUntil: b.refundable_until,
    hasLiteApiId: terms.hasLiteApiId,
    cancellable: cancelEligibility(terms, now).ok,
  };
}
