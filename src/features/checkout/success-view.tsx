import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import type { OwnBooking } from "@/server/bookings";
import { nightsBetween } from "@/lib/booking/stay";
import { formatDateRange, nightsLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cancellationText } from "@/lib/cancellation";
import { HotelImage } from "@/components/ui/hotel-image";
import { buttonClasses } from "@/components/ui/button";

export function SuccessView({ booking }: { booking: OwnBooking }) {
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const cancellation = cancellationText({ refundable: booking.refundable_until !== null, freeCancellationUntil: booking.refundable_until });
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center md:py-16">
      <span className="mx-auto grid size-20 place-items-center rounded-full bg-success/10">
        <Check className="size-10 text-success" strokeWidth={3} aria-hidden />
      </span>
      <h1 className="mt-5 text-title font-bold">Бронювання підтверджено</h1>
      <p className="mt-2 text-muted">
        Номер бронювання <b className="font-mono text-ink">{booking.liteapi_booking_id}</b>
      </p>

      <div className="mt-6 flex gap-3 rounded-card border border-line bg-surface p-3 text-left">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-button bg-line">
          <HotelImage src={booking.hotel_image} alt="" sizes="64px" />
        </div>
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold">{booking.hotel_name}</p>
          <p className="text-xs text-muted">
            {formatDateRange(booking.check_in, booking.check_out)} · {nightsLabel(nights)}
          </p>
          <p className="text-xs text-muted">{booking.room_name}</p>
          <p className="mt-1 text-xs font-semibold">{formatMoney({ amount: Number(booking.total_amount), currency: booking.currency })}</p>
        </div>
      </div>
      <p className="mt-2 text-left text-xs text-muted">{cancellation}</p>

      <div className="mt-4 rounded-card bg-primary-soft p-4 text-left text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-primary-dark">
          <Sparkles className="size-4" aria-hidden />
          Guesteria AI уже знає про поїздку
        </p>
        <p className="mt-1 text-primary-dark/80">Пройдіть онлайн-чекін, замовте ранній заїзд чи трансфер — просто напишіть.</p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link href={`/account/trips/${booking.id}`} className={buttonClasses({ size: "lg" })}>
          Відкрити поїздку
        </Link>
        <Link href="/" className={buttonClasses({ variant: "ghost", size: "lg" })}>
          На головну
        </Link>
      </div>
    </div>
  );
}
