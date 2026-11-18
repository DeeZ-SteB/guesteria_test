"use client";

import Link from "next/link";
import { Heart, MapPin } from "lucide-react";
import type { HotelSummary } from "@/lib/hotels/types";
import { formatMoney } from "@/lib/money";
import { nightsLabel } from "@/lib/format";
import { cn } from "@/lib/cn";
import { HotelImage } from "@/components/ui/hotel-image";
import { RatingSummary, Stars } from "@/components/ui/rating";

type HotelCardProps = {
  hotel: HotelSummary;
  href: string;
  nights: number;
  favorite: boolean;
  onToggleFavorite: () => void;
  eager?: boolean;
};

/** Vertical on phones/tablets, horizontal from 1024 px. The whole card is one link; the heart sits above it. */
export function HotelCard({ hotel, href, nights, favorite, onToggleFavorite, eager }: HotelCardProps) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-md has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary lg:flex-row">
      <div className="relative h-44 shrink-0 bg-line lg:h-auto lg:min-h-48 lg:w-60">
        <HotelImage src={hotel.photo} alt="" sizes="(min-width:1024px) 240px, (min-width:768px) 50vw, 100vw" eager={eager} />
        {/* On the photo (like the prototype), above the card's stretched link. */}
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? `Прибрати з обраного: ${hotel.name}` : `Додати в обране: ${hotel.name}`}
          className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-surface/95 shadow"
        >
          <Heart className={cn("size-5", favorite ? "fill-danger text-danger" : "text-ink")} aria-hidden />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row lg:p-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug lg:text-lg">
            <Link href={href} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
              {hotel.name}
            </Link>
          </h3>
          <Stars count={hotel.stars} className="mt-0.5" />
          {hotel.address && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{hotel.address}</span>
            </p>
          )}
        </div>
        <div className="flex items-end justify-between gap-3 lg:w-48 lg:flex-col lg:items-end">
          <RatingSummary rating={hotel.rating} reviewCount={hotel.reviewCount} />
          <div className="text-right">
            <p className="text-xl font-bold lg:text-2xl">{formatMoney(hotel.price)}</p>
            <p className="text-[11px] text-muted">за {nightsLabel(nights)}, з податками</p>
          </div>
        </div>
      </div>
    </article>
  );
}
