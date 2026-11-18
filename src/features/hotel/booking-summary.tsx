import type { HotelDetails } from "@/lib/hotels/types";
import type { Stay } from "@/lib/booking/stay";
import { nightsBetween } from "@/lib/booking/stay";
import { cheapestRate } from "@/lib/hotels/rates";
import { formatMoney } from "@/lib/money";
import { adultsLabel, formatDateRange, nightsLabel } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { RatingSummary } from "@/components/ui/rating";
import { loadRates } from "./data";

/** Desktop sticky card or phone/tablet sticky bar. Reuses the page's single rates request. */
export async function BookingSummary({ hotel, stay, variant }: { hotel: HotelDetails; stay: Stay | null; variant: "card" | "bar" }) {
  const rates = stay ? await loadRates(hotel.id, stay.checkIn, stay.checkOut, stay.adults) : null;
  const best = rates && "offers" in rates ? cheapestRate(rates.offers) : null;
  // Only a real "no availability" may say so; other failures are a temporary pricing problem.
  const failed = !!rates && "error" in rates && rates.error !== "no_availability";
  const emptyText = !stay ? null : failed ? "Ціни тимчасово недоступні" : "Немає вільних номерів";
  const nights = stay ? nightsBetween(stay.checkIn, stay.checkOut) : 0;
  const cta = (
    <a href="#rooms" className={buttonClasses({ size: "lg", className: variant === "card" ? "w-full" : "" })}>
      {stay ? "Обрати номер" : "Оберіть дати"}
    </a>
  );

  if (variant === "bar") {
    return (
      <div
        data-sticky-cta
        className="fixed inset-x-0 z-30 flex h-[72px] items-center justify-between gap-3 border-t border-line bg-surface px-4 bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] md:bottom-0 lg:hidden"
      >
        <div className="min-w-0">
          {best ? (
            <>
              <p className="text-xs text-muted">від</p>
              <p className="truncate font-bold leading-tight">
                {formatMoney(best.price)} <span className="text-xs font-normal text-muted">за {nightsLabel(nights)}</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{emptyText ?? "Ціни — після вибору дат"}</p>
          )}
        </div>
        {cta}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <RatingSummary rating={hotel.rating} reviewCount={hotel.reviewCount} />
      {stay && (
        <p className="mt-4 text-sm">
          {formatDateRange(stay.checkIn, stay.checkOut)} · {nightsLabel(nights)} · {adultsLabel(stay.adults)}
        </p>
      )}
      {best ? (
        <p className="mt-3">
          <span className="block text-sm text-muted">від</span>
          <span className="text-2xl font-bold">{formatMoney(best.price)}</span>{" "}
          <span className="text-sm text-muted">за {nightsLabel(nights)}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">{emptyText ?? "Оберіть дати, щоб побачити ціни"}</p>
      )}
      <div className="mt-4">{cta}</div>
    </div>
  );
}

/** Same footprint as the bar while rates load, so the page and the AI button don't jump. */
export function BookingBarSkeleton() {
  return (
    <div
      data-sticky-cta
      aria-hidden
      className="fixed inset-x-0 z-30 h-[72px] animate-pulse border-t border-line bg-surface bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] md:bottom-0 lg:hidden"
    />
  );
}
