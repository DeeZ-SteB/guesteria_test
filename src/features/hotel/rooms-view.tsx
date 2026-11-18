"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarX, Coffee, Maximize2, SearchX } from "lucide-react";
import type { RateOption, RoomOffer } from "@/lib/hotels/types";
import type { Stay } from "@/lib/booking/stay";
import { nightsBetween } from "@/lib/booking/stay";
import { cheapestRate, filterOffers, payAtHotelText } from "@/lib/hotels/rates";
import { cancellationText } from "@/lib/cancellation";
import { formatMoney } from "@/lib/money";
import { nightsLabel } from "@/lib/format";
import { checkoutHref } from "@/lib/search/params";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/feedback";
import { HotelImage } from "@/components/ui/hotel-image";
import { useAuthModal } from "@/features/auth/auth-modal";

type Props = { offers: RoomOffer[]; hotelId: string; hotelName: string; stay: Stay; signedIn: boolean };

export function RoomsView({ offers, hotelId, hotelName, stay, signedIn }: Props) {
  const [filters, setFilters] = useState({ breakfast: false, freeCancel: false });
  const visible = useMemo(() => filterOffers(offers, filters), [offers, filters]);
  const cheapest = useMemo(() => cheapestRate(offers), [offers]);
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const router = useRouter();
  const { open } = useAuthModal();

  function choose(rate: RateOption) {
    const href = checkoutHref({ offerId: rate.offerId, hotelId, stay });
    if (signedIn) router.push(href);
    else open({ next: href, title: "Увійдіть, щоб забронювати" });
  }

  if (offers.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Немає вільних номерів на ці дати"
        text="Спробуйте змінити дати або кількість гостей у формі вище."
        className="py-8"
      />
    );
  }

  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" role="group" aria-label="Фільтри тарифів">
        <Chip pressed={filters.breakfast} onClick={() => setFilters((f) => ({ ...f, breakfast: !f.breakfast }))}>
          <Coffee className="size-4" aria-hidden />
          Сніданок включено
        </Chip>
        <Chip pressed={filters.freeCancel} onClick={() => setFilters((f) => ({ ...f, freeCancel: !f.freeCancel }))}>
          Безкоштовне скасування
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Жоден тариф не відповідає фільтрам"
          action={<Button onClick={() => setFilters({ breakfast: false, freeCancel: false })}>Скинути фільтри</Button>}
          className="py-8"
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((offer) => (
            <li key={offer.room?.id ?? offer.name} className="overflow-hidden rounded-card border border-line lg:grid lg:grid-cols-[260px_1fr]">
              <RoomInfo offer={offer} hotelName={hotelName} />
              <ul className="divide-y divide-line">
                {offer.rates.map((rate) => (
                  <RateRow
                    key={rate.offerId}
                    rate={rate}
                    nights={nights}
                    cheapest={rate.offerId === cheapest?.offerId}
                    onChoose={() => choose(rate)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomInfo({ offer, hotelName }: { offer: RoomOffer; hotelName: string }) {
  const photo = offer.room?.photos[0] ?? null;
  return (
    <div className="border-b border-line lg:border-b-0 lg:border-r">
      <div className="relative h-36 bg-line lg:h-40">
        <HotelImage src={photo} alt={photo ? `${hotelName}: ${offer.name}` : ""} sizes="(min-width:1024px) 260px, 100vw" />
      </div>
      <div className="p-3">
        <h3 className="font-semibold">{offer.name}</h3>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {offer.room?.sizeSqm && (
            <li className="flex items-center gap-1">
              <Maximize2 className="size-3.5" aria-hidden />
              {offer.room.sizeSqm} м²
            </li>
          )}
          {offer.room?.beds.map((bed) => (
            <li key={bed} className="flex items-center gap-1">
              <BedDouble className="size-3.5" aria-hidden />
              {bed}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RateRow({ rate, nights, cheapest, onChoose }: { rate: RateOption; nights: number; cheapest: boolean; onChoose: () => void }) {
  const cancellation = cancellationText(rate);
  const free = cancellation.startsWith("Безкоштовне");
  const fees = payAtHotelText(rate.payAtHotel);
  return (
    <li className={cn("flex flex-wrap items-end justify-between gap-3 p-3", cheapest && "bg-primary-soft/40")}>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        {cheapest && <span className="inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">Найдешевше</span>}
        <p className="flex items-center gap-1.5">
          <Coffee className="size-4 text-muted" aria-hidden />
          {rate.boardLabel}
        </p>
        <p className={cn("text-xs font-medium", free ? "text-success" : "text-danger")}>
          {free ? "✓ " : ""}
          {cancellation}
        </p>
        {fees && <p className="text-xs text-muted">{fees}</p>}
      </div>
      <div className="text-right">
        <p className="text-lg font-bold">{formatMoney(rate.price)}</p>
        <p className="text-[11px] text-muted">за {nightsLabel(nights)}, з податками</p>
        <Button className="mt-2" onClick={onChoose}>
          Обрати
        </Button>
      </div>
    </li>
  );
}
