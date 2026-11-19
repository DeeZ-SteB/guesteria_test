"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HotelImage } from "@/components/ui/hotel-image";
import { formatDateRange, nightsLabel, pluralUk } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cancellationText } from "@/lib/cancellation";
import { findCity } from "@/lib/cities";
import { nightsBetween } from "@/lib/booking/stay";
import { cancelEligibility, tripBadge, type TripBadge, type TripRow } from "@/lib/booking/trips";
import { cn } from "@/lib/cn";

const STATUS = {
  confirmed: { label: "Підтверджено", tone: "bg-success/10 text-success" },
  pending: { label: "Обробляється", tone: "bg-accent/10 text-accent" },
  cancelled: { label: "Скасовано", tone: "bg-danger/10 text-danger" },
} as const;

function badgeText(b: TripBadge): string {
  switch (b.kind) {
    case "in_days":
      return b.days === 1 ? "Завтра" : `Через ${b.days} ${pluralUk(b.days, ["день", "дні", "днів"])}`;
    case "today":
      return "Заїзд сьогодні";
    case "ongoing":
      return "Ви зараз тут";
    case "processing":
      return "Перевірте статус";
  }
}

export function TripCard({ trip, today, nearestId, onCancel }: { trip: TripRow; today: string; nearestId: string | null; onCancel: () => void }) {
  const status = STATUS[trip.status];
  const badge = tripBadge(trip, today, nearestId);
  const city = trip.city ? findCity(trip.city)?.nameUk : null;
  // Pending attempts are resolved on the confirmation page; the trip page needs a confirmed booking.
  const href = trip.status === "pending" ? `/checkout?booking=${trip.id}` : `/account/trips/${trip.id}`;
  const canCancel = trip.status === "confirmed" && trip.checkOut >= today && cancelEligibility(trip, new Date()).ok;
  const upcoming = trip.status === "confirmed" && trip.checkOut >= today;

  return (
    <article className={cn("overflow-hidden rounded-card border border-line bg-surface", trip.status === "cancelled" && "opacity-80")}>
      <Link href={href} className="flex gap-3 p-3 hover:bg-bg/60">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-button bg-line md:size-24">
          <HotelImage src={trip.hotelImage} alt="" sizes="96px" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", status.tone)}>{status.label}</span>
            {badge && badge.kind !== "processing" && (
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">{badgeText(badge)}</span>
            )}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold">{trip.hotelName}</h3>
          <p className="text-xs text-muted">
            {city ? `${city} · ` : ""}
            {formatDateRange(trip.checkIn, trip.checkOut)} · {nightsLabel(nightsBetween(trip.checkIn, trip.checkOut))}
          </p>
          <p className="truncate text-xs text-muted">{trip.roomName}</p>
          <p className="mt-1 font-semibold">{formatMoney({ amount: trip.totalAmount, currency: trip.currency })}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 self-center text-muted" aria-hidden />
      </Link>
      {trip.status === "pending" && (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Сервіс ще не підтвердив бронювання. Відкрийте, щоб перевірити статус.</p>
      )}
      {upcoming && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-t border-line px-3 py-2">
          <p className="text-xs text-muted">{cancellationText({ refundable: trip.refundable, freeCancellationUntil: trip.refundableUntil })}</p>
          {canCancel && (
            <button type="button" onClick={onCancel} className="min-h-10 shrink-0 rounded-button px-3 text-sm font-semibold text-danger hover:bg-danger/10">
              Скасувати
            </button>
          )}
        </div>
      )}
    </article>
  );
}
