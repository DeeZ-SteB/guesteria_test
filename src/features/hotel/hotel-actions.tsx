"use client";

import { useState } from "react";
import { Heart, Share2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFavoriteToggle, type FavoriteTarget } from "@/features/favorites/use-favorite-toggle";

export function HotelActions({
  target,
  favoriteIds,
  signedIn,
  cityId,
}: {
  target: FavoriteTarget;
  favoriteIds: string[];
  signedIn: boolean;
  cityId: string | null;
}) {
  const favorites = useFavoriteToggle({ favoriteIds, signedIn, hotels: [target], cityId });
  const [copied, setCopied] = useState(false);
  const favorite = favorites.ids.has(target.id);

  async function share() {
    // Share the hotel page without dates or offers: it's for a friend, not a booking hand-off.
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: target.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user cancelled or clipboard blocked */
    }
  }

  const button = "grid size-11 place-items-center rounded-full border border-line bg-surface hover:border-primary";
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <button type="button" onClick={share} className={button} aria-label="Поділитися готелем">
          <Share2 className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => favorites.toggle(target)}
          aria-pressed={favorite}
          aria-label={favorite ? "Прибрати з обраного" : "Додати в обране"}
          className={button}
        >
          <Heart className={cn("size-5", favorite && "fill-danger text-danger")} aria-hidden />
        </button>
      </div>
      <p role="status" className="text-xs text-muted">
        {copied ? "Посилання скопійовано" : (favorites.message ?? "")}
      </p>
    </div>
  );
}
