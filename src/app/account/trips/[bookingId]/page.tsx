import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getOwnBooking, type OwnBooking } from "@/server/bookings";
import { getCheckin, listGuestRequests } from "@/server/trip";
import { todayInKyiv } from "@/lib/booking/stay";
import { tripBadge } from "@/lib/booking/trips";
import { checkinEligibility, REQUEST_TYPES, requestTypeAvailable, tripMode } from "@/lib/booking/trip-page";
import { boardLabel } from "@/lib/board";
import { findCity } from "@/lib/cities";
import { ErrorState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { toTripRow } from "@/features/account/trips/to-trip-row";
import { TripDetails } from "@/features/trip/trip-details";
import { TripActions } from "@/features/trip/trip-actions";
import { BlockSkeleton, getTripHotel, TripDirections, TripHotelInfo } from "@/features/trip/trip-hotel-blocks";
import { TripAssistantSlot } from "@/features/trip/trip-assistant-slot";
import AccountLoading from "../../loading";

export const metadata: Metadata = { title: "Моя поїздка" };
// Cancellation from this page: LiteAPI cancel (30 s) + read-back (15 s).
export const maxDuration = 60;

const paramsSchema = z.object({ bookingId: z.uuid() });

export default function TripPage({ params }: PageProps<"/account/trips/[bookingId]">) {
  return (
    <Suspense fallback={<AccountLoading />}>
      <TripContent params={params} />
    </Suspense>
  );
}

async function TripContent({ params }: { params: PageProps<"/account/trips/[bookingId]">["params"] }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const bookingId = parsed.data.bookingId;
  const user = await requireUser(`/account/trips/${bookingId}`);
  await connection();

  let booking: OwnBooking | null;
  try {
    booking = await getOwnBooking(user.id, bookingId);
  } catch {
    return (
      <ErrorState
        title="Не вдалося завантажити поїздку"
        text="Спробуйте ще раз за хвилину."
        action={
          <Link href={`/account/trips/${bookingId}`} className={buttonClasses()}>
            Спробувати ще
          </Link>
        }
      />
    );
  }
  // Someone else's id and a missing one look the same.
  if (!booking) notFound();

  const now = new Date();
  const today = todayInKyiv(now);
  const stay = { status: booking.status, checkIn: booking.check_in, checkOut: booking.check_out };
  const mode = tripMode(stay, today);
  // An unfinished attempt is resolved on its status page.
  if (mode === "pending") redirect(`/checkout?booking=${booking.id}`, RedirectType.replace);

  const trip = toTripRow(booking, now);
  const cityName = booking.city ? (findCity(booking.city)?.nameUk ?? null) : null;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-8 md:py-8">
      <Link href="/account?tab=trips" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
        <ChevronLeft className="size-4" aria-hidden />
        Усі поїздки
      </Link>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-4">
          <TripDetails
            trip={trip}
            mode={mode}
            badge={tripBadge(trip, today, trip.id)}
            bookingNumber={booking.liteapi_booking_id}
            boardLabel={boardLabel(booking.board)}
          />
          <Suspense fallback={<BlockSkeleton tall />}>
            <TripActionsSection userId={user.id} booking={booking} today={today} mode={mode} />
          </Suspense>
          <Suspense fallback={<BlockSkeleton />}>
            <TripDirections hotelId={booking.hotel_id} hotelName={booking.hotel_name} cityName={cityName} />
          </Suspense>
          <Suspense fallback={<BlockSkeleton tall />}>
            <TripHotelInfo hotelId={booking.hotel_id} />
          </Suspense>
        </div>
        {mode === "active" && <TripAssistantSlot bookingId={booking.id} hotelName={booking.hotel_name} />}
      </div>
    </div>
  );
}

/** The check-in time is only a hint: never hold check-in and requests back for a slow LiteAPI. */
const HOTEL_HINT_WAIT_MS = 1500;
const hotelHint = (hotelId: string) =>
  Promise.race([getTripHotel(hotelId).then((h) => h?.checkIn ?? null), new Promise<null>((resolve) => setTimeout(() => resolve(null), HOTEL_HINT_WAIT_MS))]);

/** Blocks 4–5: from our database; the hotel's check-in time is used if it arrives quickly. */
async function TripActionsSection({ userId, booking, today, mode }: { userId: string; booking: OwnBooking; today: string; mode: "active" | "past" | "cancelled" }) {
  const stay = { status: booking.status, checkIn: booking.check_in, checkOut: booking.check_out };
  const [checkin, requests, hotelCheckIn] = await Promise.allSettled([getCheckin(userId, booking.id), listGuestRequests(userId, booking.id), hotelHint(booking.hotel_id)]);
  const active = mode === "active";
  return (
    <TripActions
      bookingId={booking.id}
      checkin={checkin.status === "fulfilled" ? checkin.value : null}
      checkinError={checkin.status === "rejected"}
      checkinEditable={active && checkinEligibility(stay, today).ok}
      requests={requests.status === "fulfilled" ? requests.value : []}
      requestsError={requests.status === "rejected"}
      // Without the current list the guest could not see what is already asked: no new requests then.
      availableTypes={active && requests.status === "fulfilled" ? REQUEST_TYPES.filter((t) => requestTypeAvailable(t, stay, today)) : []}
      live={active && requests.status === "fulfilled"}
      hotelCheckIn={hotelCheckIn.status === "fulfilled" ? hotelCheckIn.value : null}
    />
  );
}
