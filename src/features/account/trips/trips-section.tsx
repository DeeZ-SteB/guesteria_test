import Link from "next/link";
import { connection } from "next/server";
import { listOwnBookings, type OwnBooking } from "@/server/bookings";
import { cancelEligibility, groupTrips, type TripRow } from "@/lib/booking/trips";
import { todayInKyiv } from "@/lib/booking/stay";
import { ErrorState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { TripsView } from "./trips-view";

/** Only display fields cross to the client: no client_reference, prebook or LiteAPI ids. */
function toTripRow(b: OwnBooking, now: Date): TripRow {
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

export async function TripsSection({ userId }: { userId: string }) {
  await connection();
  let rows: OwnBooking[];
  try {
    rows = await listOwnBookings(userId);
  } catch {
    return (
      <ErrorState
        title="Не вдалося завантажити поїздки"
        text="Спробуйте ще раз за хвилину."
        action={
          <Link href="/account?tab=trips" className={buttonClasses()}>
            Спробувати ще
          </Link>
        }
      />
    );
  }
  const now = new Date();
  const today = todayInKyiv(now);
  return <TripsView groups={groupTrips(rows.map((r) => toTripRow(r, now)), today)} today={today} />;
}
