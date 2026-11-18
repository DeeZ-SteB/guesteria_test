"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarX, SearchX, SlidersHorizontal } from "lucide-react";
import type { HotelSummary } from "@/lib/hotels/types";
import { findCity } from "@/lib/cities";
import { hotelsFoundLabel } from "@/lib/format";
import { nightsBetween, todayInKyiv } from "@/lib/booking/stay";
import { hotelHref, parseView, searchHref, SORTS, type SearchQuery, type Sort, type ViewState } from "@/lib/search/params";
import { activeFilterCount, applyView, clampPrice, countMatching, priceBounds } from "@/lib/search/filter";
import { saveRecent } from "@/lib/search/recent";
import { storePending, takePending } from "@/lib/favorites/pending";
import { createRequestTracker } from "@/lib/favorites/tracker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { useAuthModal } from "@/features/auth/auth-modal";
import { setFavorite } from "@/features/favorites/actions";
import { FiltersFields } from "./filters";
import { HotelCard } from "./hotel-card";

const SORT_LABELS: Record<Sort, string> = {
  recommended: "Рекомендовані",
  price_asc: "Спершу дешевші",
  price_desc: "Спершу дорожчі",
  rating_desc: "Найвища оцінка",
};

type ResultsViewProps = { hotels: HotelSummary[]; favoriteIds: string[]; query: SearchQuery; signedIn: boolean };

export function ResultsView({ hotels, favoriteIds, query, signedIn }: ResultsViewProps) {
  const params = useSearchParams();
  const bounds = useMemo(() => priceBounds(hotels), [hotels]);
  // URL price ranges (shared links, reloads with new prices) are clamped to today's bounds.
  const view = useMemo(() => {
    const parsed = parseView(params);
    return { ...parsed, price: clampPrice(parsed.price, bounds) };
  }, [params, bounds]);
  const visible = useMemo(() => applyView(hotels, view), [hotels, view]);
  const nights = nightsBetween(query.checkIn, query.checkOut);
  const city = findCity(query.cityId);

  // Sort/filter live in the URL but never hit the server: the History API updates
  // useSearchParams without a navigation, so LiteAPI is not called again.
  const setView = useCallback(
    (next: ViewState) => window.history.replaceState(null, "", searchHref(query, next)),
    [query],
  );

  useEffect(() => saveRecent(query, todayInKyiv()), [query]);

  const favorites = useFavorites({ favoriteIds, signedIn, hotels, cityId: query.cityId });

  // ---- mobile filters sheet with a draft ----
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(view);
  const filterCount = activeFilterCount(view);

  if (hotels.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="На ці дати вільних готелів немає"
        text={`Спробуйте інші дати або інше місто${city ? ` замість «${city.nameUk}»` : ""}.`}
        className="py-16"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-8 md:py-6">
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Фільтри">
          <div className="sticky top-24 rounded-card border border-line bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Фільтри</h2>
              {filterCount > 0 && (
                <button type="button" className="text-sm font-medium text-primary" onClick={() => setView({ ...view, price: null, stars: [], rating: null })}>
                  Скинути
                </button>
              )}
            </div>
            <FiltersFields view={view} onChange={setView} bounds={bounds} />
          </div>
        </aside>

        <section aria-labelledby="results-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h1 id="results-title" className="text-lg font-bold md:text-xl" aria-live="polite">
              {city?.nameUk}: {hotelsFoundLabel(visible.length).toLowerCase()}
            </h1>
            <div className="flex w-full gap-2 sm:w-auto">
              <label className="relative flex-1 sm:flex-none">
                <span className="sr-only">Сортування</span>
                <select
                  value={view.sort}
                  onChange={(e) => setView({ ...view, sort: e.target.value as Sort })}
                  className="min-h-11 w-full appearance-none rounded-button border border-line bg-surface px-3 pr-8 text-sm font-medium"
                >
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>
                  ▾
                </span>
              </label>
              <Button
                variant="outline"
                className="flex-1 sm:flex-none lg:hidden"
                onClick={() => {
                  setDraft(view);
                  setSheetOpen(true);
                }}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                Фільтри{filterCount > 0 && ` · ${filterCount}`}
              </Button>
            </div>
          </div>

          {favorites.message && (
            <p role="status" className="mb-3 rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
              {favorites.message}
            </p>
          )}

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Жоден готель не відповідає фільтрам"
              action={<Button onClick={() => setView({ ...view, price: null, stars: [], rating: null })}>Скинути фільтри</Button>}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              {visible.map((hotel, index) => (
                <li key={hotel.id}>
                  <HotelCard
                    hotel={hotel}
                    href={hotelHref(hotel.id, query)}
                    nights={nights}
                    favorite={favorites.ids.has(hotel.id)}
                    onToggleFavorite={() => favorites.toggle(hotel)}
                    eager={index === 0}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-center text-xs text-muted">Показано до 50 готелів міста з доступними номерами на ці дати.</p>
        </section>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Фільтри">
        <FiltersFields view={draft} onChange={setDraft} bounds={bounds} />
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={() => setDraft({ ...draft, price: null, stars: [], rating: null })}>
            Скинути
          </Button>
          <Button
            fullWidth
            size="lg"
            onClick={() => {
              setView(draft);
              setSheetOpen(false);
            }}
          >
            Показати {countMatching(hotels, draft)}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Hearts: optimistic local state, rolled back if the save fails. Signed-out taps remember
 * the hotel and open the auth modal; after login the page re-renders and the intent is replayed once.
 */
function useFavorites({
  favoriteIds,
  signedIn,
  hotels,
  cityId,
}: {
  favoriteIds: string[];
  signedIn: boolean;
  hotels: HotelSummary[];
  cityId: string;
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
    async (hotel: HotelSummary, favorite: boolean, previous: boolean) => {
      const token = tracker.current.begin(hotel.id, previous);
      setOne(hotel.id, favorite);
      setMessage(null);
      const result = await setFavorite({ hotelId: hotel.id, hotelName: hotel.name, hotelImage: hotel.photo, cityId, favorite });
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
    (hotel: HotelSummary) => {
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
