"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import type { SavedHotel } from "@/server/favorites";
import { useFavoriteToggle, type FavoriteTarget } from "@/features/favorites/use-favorite-toggle";
import { EmptyState } from "@/components/ui/feedback";
import { HotelImage } from "@/components/ui/hotel-image";
import { buttonClasses } from "@/components/ui/button";
import { findCity } from "@/lib/cities";
import { defaultStay, todayInKyiv, type Stay } from "@/lib/booking/stay";
import { readRecent } from "@/lib/search/recent";
import { hotelHref } from "@/lib/search/params";
import { cn } from "@/lib/cn";

const noop = () => () => {};

/** The dates the guest last searched (same city first), so a card opens with real prices. */
function stayFor(cityId: string | null, today: string): Stay {
  const recent = readRecent(today);
  const match = recent.find((r) => r.cityId === cityId) ?? recent[0];
  return match ? { checkIn: match.checkIn, checkOut: match.checkOut, adults: match.adults } : defaultStay(today);
}

export function FavoritesView({ hotels }: { hotels: SavedHotel[] }) {
  const targets = useMemo<FavoriteTarget[]>(() => hotels.map((h) => ({ id: h.hotelId, name: h.hotelName, photo: h.hotelImage, cityId: h.cityId })), [hotels]);
  const initialIds = useMemo(() => hotels.map((h) => h.hotelId), [hotels]);
  const { ids, toggle, message } = useFavoriteToggle({ favoriteIds: initialIds, signedIn: true, hotels: targets, cityId: null });
  // Recent searches live in localStorage: read after hydration only.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  if (hotels.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={Heart}
          title="В обраному порожньо"
          text="Натисніть ♡ на картці готелю, щоб зберегти його."
          action={
            <Link href="/" className={buttonClasses()}>
              Знайти готель
            </Link>
          }
        />
      </div>
    );
  }

  const today = todayInKyiv();
  return (
    <section aria-labelledby="fav-title">
      <h2 id="fav-title" className="sr-only">
        Обране
      </h2>
      {message && (
        <p role="alert" className="mb-3 rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
          {message}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="list">
        {targets.map((hotel) => {
          const saved = ids.has(hotel.id);
          const city = hotel.cityId ? findCity(hotel.cityId) : undefined;
          const href = hydrated ? hotelHref(hotel.id, { ...stayFor(hotel.cityId ?? null, today), cityId: hotel.cityId }) : `/hotels/${encodeURIComponent(hotel.id)}`;
          return (
            <li key={hotel.id} className={cn("relative overflow-hidden rounded-card border border-line bg-surface transition-opacity", !saved && "opacity-60")}>
              <Link href={href} className="block">
                <div className="relative aspect-[16/10] bg-line">
                  <HotelImage src={hotel.photo} alt="" sizes="(min-width:1024px) 300px, (min-width:768px) 50vw, 100vw" />
                </div>
                <div className="p-3">
                  <h3 className="truncate font-semibold">{hotel.name}</h3>
                  {city && <p className="text-xs text-muted">{city.nameUk}</p>}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => toggle(hotel)}
                aria-pressed={saved}
                aria-label={saved ? `Прибрати «${hotel.name}» з обраного` : `Повернути «${hotel.name}» в обране`}
                className="absolute right-2 top-2 flex min-h-10 items-center gap-1 rounded-full bg-surface/95 px-3 text-sm font-medium shadow"
              >
                <Heart className={cn("size-4", saved ? "fill-danger text-danger" : "text-muted")} aria-hidden />
                {!saved && "Повернути"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
