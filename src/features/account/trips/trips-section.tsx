import Link from "next/link";
import { connection } from "next/server";
import { listOwnBookings, type OwnBooking } from "@/server/bookings";
import { groupTrips } from "@/lib/booking/trips";
import { toTripRow } from "./to-trip-row";
import { listCheckedInIds } from "@/server/trip";
import { todayInKyiv } from "@/lib/booking/stay";
import { ErrorState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { TripsView } from "./trips-view";

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
  const trips = rows.map((r) => toTripRow(r, now));
  // «Чекін не пройдено» badge: only for confirmed stays that can still be checked in. Best effort.
  const open = trips.filter((t) => t.status === "confirmed" && t.checkIn >= today).map((t) => t.id);
  const checkedIn = await listCheckedInIds(userId, open).catch(() => null);
  if (checkedIn) for (const t of trips) if (open.includes(t.id)) t.checkedIn = checkedIn.has(t.id);
  return <TripsView groups={groupTrips(trips, today)} today={today} />;
}
