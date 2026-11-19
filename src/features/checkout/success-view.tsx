import Link from "next/link";
import { Check, Clock, Sparkles, XCircle } from "lucide-react";
import type { OwnBooking } from "@/server/bookings";
import type { ViewState } from "./resolve";
import { nightsBetween } from "@/lib/booking/stay";
import { formatDateRange, nightsLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cancellationText } from "@/lib/cancellation";
import { hotelHref } from "@/lib/search/params";
import { HotelImage } from "@/components/ui/hotel-image";
import { buttonClasses } from "@/components/ui/button";
import { RefreshButton } from "./refresh-button";

const HEAD: Record<ViewState, { title: string; icon: typeof Check; tone: string }> = {
  confirmed: { title: "Бронювання підтверджено", icon: Check, tone: "bg-success/10 text-success" },
  pending: { title: "Бронювання обробляється", icon: Clock, tone: "bg-accent/10 text-accent" },
  cancelled: { title: "Бронювання скасовано", icon: XCircle, tone: "bg-danger/10 text-danger" },
  gone: { title: "Бронювання не відбулося", icon: XCircle, tone: "bg-danger/10 text-danger" },
};

export function SuccessView({ booking, state }: { booking: OwnBooking; state: ViewState }) {
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const head = HEAD[state];
  const Icon = head.icon;
  const back = hotelHref(booking.hotel_id, { checkIn: booking.check_in, checkOut: booking.check_out, adults: booking.adults, cityId: booking.city });

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center md:py-16">
      <span className={`mx-auto grid size-20 place-items-center rounded-full ${head.tone}`}>
        <Icon className="size-10" strokeWidth={3} aria-hidden />
      </span>
      <h1 className="mt-5 text-title font-bold">{head.title}</h1>
      {state === "confirmed" && booking.liteapi_booking_id && (
        <p className="mt-2 text-muted">
          Номер бронювання <b className="font-mono text-ink">{booking.liteapi_booking_id}</b>
        </p>
      )}
      {state === "pending" && (
        <p className="mt-2 text-sm text-muted">Сервіс бронювання ще не підтвердив результат. Повторного бронювання не буде — просто оновіть статус за хвилину.</p>
      )}
      {state === "gone" && <p className="mt-2 text-sm text-muted">Номер не було заброньовано, кошти не списано. Оберіть номер знову.</p>}

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
      {state === "confirmed" && (
        <p className="mt-2 text-left text-xs text-muted">
          {cancellationText({ refundable: booking.refundable, freeCancellationUntil: booking.refundable_until })}
        </p>
      )}

      {state === "confirmed" && (
        <div className="mt-4 rounded-card bg-primary-soft p-4 text-left text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-primary-dark">
            <Sparkles className="size-4" aria-hidden />
            Guesteria AI уже знає про поїздку
          </p>
          <p className="mt-1 text-primary-dark/80">Пройдіть онлайн-чекін, замовте ранній заїзд чи трансфер — просто напишіть.</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {state === "confirmed" && (
          <Link href={`/account/trips/${booking.id}`} className={buttonClasses({ size: "lg" })}>
            Відкрити поїздку
          </Link>
        )}
        {state === "pending" && <RefreshButton />}
        {state === "gone" && (
          <Link href={back} className={buttonClasses({ size: "lg" })}>
            Обрати номер знову
          </Link>
        )}
        <Link href="/" className={buttonClasses({ variant: "ghost", size: "lg" })}>
          На головну
        </Link>
      </div>
    </div>
  );
}
