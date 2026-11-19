"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { HotelImage } from "@/components/ui/hotel-image";
import { formatDateRange, adultsLabel, nightsLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cancellationText } from "@/lib/cancellation";
import { findCity } from "@/lib/cities";
import { nightsBetween } from "@/lib/booking/stay";
import { tripBadgeText, type TripBadge, type TripRow } from "@/lib/booking/trips";
import type { TripMode } from "@/lib/booking/trip-page";
import { cn } from "@/lib/cn";
import { CancelSheet } from "@/features/account/trips/cancel-sheet";

const STATUS = {
  active: { label: "Підтверджено", tone: "bg-success/10 text-success-ink" },
  past: { label: "Завершено", tone: "bg-line text-muted" },
  cancelled: { label: "Скасовано", tone: "bg-danger/10 text-danger" },
} as const;

function CopyNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-button px-2 font-mono text-sm hover:bg-bg"
      aria-label={`Скопіювати номер бронювання ${value}`}
    >
      {value}
      {copied ? <Check className="size-4 text-success-ink" aria-hidden /> : <Copy className="size-4 text-muted" aria-hidden />}
    </button>
  );
}

/** Blocks 1–2: header and booking details with the stage-6 cancellation flow. */
export function TripDetails({
  trip,
  mode,
  badge,
  bookingNumber,
  boardLabel,
}: {
  trip: TripRow;
  mode: Exclude<TripMode, "pending">;
  badge: TripBadge | null;
  bookingNumber: string | null;
  boardLabel: string;
}) {
  const [cancelling, setCancelling] = useState(false);
  const status = STATUS[mode];
  const city = trip.city ? findCity(trip.city)?.nameUk : null;
  const nights = nightsBetween(trip.checkIn, trip.checkOut);

  return (
    <>
      <header className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="relative h-44 bg-line md:h-56">
          <HotelImage src={trip.hotelImage} alt="" sizes="(min-width:1024px) 700px, 100vw" eager />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur", status.tone, "bg-surface/90")}>{status.label}</span>
            {badge && mode === "active" && (
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary">{tripBadgeText(badge)}</span>
            )}
          </div>
        </div>
        <div className="p-4 md:p-5">
          <h1 className="text-title font-bold">{trip.hotelName}</h1>
          <p className="text-sm text-muted">
            {city ? `${city} · ` : ""}
            {formatDateRange(trip.checkIn, trip.checkOut)} · {nightsLabel(nights)}
          </p>
          {bookingNumber && (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-muted">
              Номер бронювання <CopyNumber value={bookingNumber} />
            </p>
          )}
        </div>
      </header>

      <section aria-labelledby="details-title" className="rounded-card border border-line bg-surface p-4 md:p-5">
        <h2 id="details-title" className="mb-3 text-base font-bold">
          Деталі
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted">Номер</dt>
            <dd className="font-medium">{trip.roomName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Харчування</dt>
            <dd>{boardLabel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Гості</dt>
            <dd>{adultsLabel(trip.adults)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Сума</dt>
            <dd className="font-semibold">{formatMoney({ amount: trip.totalAmount, currency: trip.currency })}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Скасування</dt>
            <dd>{mode === "cancelled" ? "Скасовано" : cancellationText({ refundable: trip.refundable, freeCancellationUntil: trip.refundableUntil })}</dd>
          </div>
        </dl>
        {trip.cancellable && mode === "active" && (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="mt-3 min-h-10 rounded-button px-3 text-sm font-semibold text-danger hover:bg-danger/10 -ml-3"
          >
            Скасувати бронювання
          </button>
        )}
      </section>
      <CancelSheet trip={cancelling ? trip : null} onClose={() => setCancelling(false)} />
    </>
  );
}
