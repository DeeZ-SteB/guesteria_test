"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { storePending, takePending } from "@/lib/favorites/pending";
import { createRequestTracker } from "@/lib/favorites/tracker";
import { useAuthModal } from "@/features/auth/auth-modal";
import { setFavorite } from "./actions";

/** What a heart needs to know about a hotel (search card or hotel page). */
export type FavoriteTarget = { id: string; name: string; photo: string | null; /** Overrides the page city (cabinet: each hotel keeps its own). */ cityId?: string | null };

/**
 * Hearts: optimistic local state, rolled back if the save fails. Signed-out taps remember
 * the hotel and open the auth modal; after login the page re-renders and the intent is replayed once.
 */
export function useFavoriteToggle({
  favoriteIds,
  signedIn,
  hotels,
  cityId,
}: {
  favoriteIds: string[];
  signedIn: boolean;
  /** Hotels on screen; a pending heart is replayed only if its hotel is among them. */
  hotels: FavoriteTarget[];
  cityId: string | null;
}) {
  const [ids, setIds] = useState(() => new Set(favoriteIds));
  const [message, setMessage] = useState<string | null>(null);
  const { open } = useAuthModal();
  const replayed = useRef(false);
  const tracker = useRef(createRequestTracker());

  const setOne = (hotelId: string, value: boolean) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(hotelId);
      else next.delete(hotelId);
      return next;
    });

  const save = useCallback(
    async (hotel: FavoriteTarget, favorite: boolean, previous: boolean) => {
      const token = tracker.current.begin(hotel.id, previous);
      setOne(hotel.id, favorite);
      setMessage(null);
      const result = await setFavorite({ hotelId: hotel.id, hotelName: hotel.name, hotelImage: hotel.photo, cityId: hotel.cityId ?? cityId, favorite });
      if (result.ok) {
        tracker.current.done(token);
        return;
      }
      // Only the latest click for this hotel rolls back, to the value before that click.
      const restore = tracker.current.rollbackValue(hotel.id, token);
      if (restore !== undefined) {
        setOne(hotel.id, restore);
        setMessage(result.reason === "unauthenticated" ? "Увійдіть, щоб зберігати готелі" : "Не вдалося зберегти. Спробуйте ще раз.");
      }
    },
    [cityId],
  );

  useEffect(() => {
    if (!signedIn) {
      replayed.current = false; // signed out in place: a later sign-in may replay again
      return;
    }
    if (replayed.current) return;
    replayed.current = true;
    const pending = takePending();
    const hotel = pending && hotels.find((h) => h.id === pending.hotelId);
    // Syncing from sessionStorage (an external system) once after login; defer the state update
    // out of the effect body so it does not cascade into this render.
    if (hotel && !favoriteIds.includes(hotel.id)) queueMicrotask(() => void save(hotel, true, false));
  }, [signedIn, hotels, favoriteIds, save]);

  const toggle = useCallback(
    (hotel: FavoriteTarget) => {
      if (!signedIn) {
        storePending(hotel.id);
        open({ title: "Увійдіть, щоб зберегти готель" });
        return;
      }
      const current = ids.has(hotel.id);
      void save(hotel, !current, current);
    },
    [signedIn, ids, open, save],
  );

  return { ids, toggle, message };
}
