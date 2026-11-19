import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getCityHotelCards, getReviews } from "@/server/liteapi";
import { cityCover, reviewHighlights, score, topHotels, type CityShowcase, type HotelCard, type ReviewHighlight } from "@/lib/home/showcase";

export type HomeShowcase = { hero: HotelCard | null; cities: CityShowcase[]; top: HotelCard[]; reviews: ReviewHighlight[] };

/** Cities on the home page, in order (8 tiles: 2 rows of 4 on desktop, 4 rows of 2 on a phone). */
export const HOME_CITY_IDS = ["lviv", "kyiv", "warsaw", "prague", "paris", "rome", "barcelona", "odesa"] as const;

/**
 * Everything the home page shows, from static LiteAPI data only (hotel lists and reviews), so it is
 * cached for hours and the page answers instantly. If LiteAPI fails, the empty result is cached for
 * seconds only and the page falls back to plain tiles.
 */
export async function getHomeShowcase(): Promise<HomeShowcase> {
  "use cache";
  cacheTag("home");
  // LiteAPI rate-limits bursts (4290): at most two requests at a time.
  const lists = await mapLimited(HOME_CITY_IDS, 2, (id) => getCityHotelCards(id).catch((): HotelCard[] | null => null));
  if (lists.every((l) => l === null)) {
    cacheLife("seconds");
    return { hero: null, cities: HOME_CITY_IDS.map((cityId) => ({ cityId, photo: null, hotelCount: 0 })), top: [], reviews: [] };
  }
  const all = lists.flatMap((l) => l ?? []);
  const top = topHotels(all, { limit: 8, perCity: 2 });
  let reviewsFailed = false;
  const reviews = reviewHighlights(
    await mapLimited(top.slice(0, 5), 2, async (hotel) => ({
      hotel,
      reviews: await getReviews(hotel.id).catch(() => {
        reviewsFailed = true;
        return [];
      }),
    })),
    6,
  );
  const hero = [...(lists[0] ?? [])].filter((h) => h.photo).sort((a, b) => score(b) - score(a))[0] ?? top[0] ?? null;
  // A partial failure (one city rate-limited) is retried within minutes, not kept for hours.
  if (lists.some((l) => l === null) || reviewsFailed) cacheLife("minutes");
  else cacheLife("hours");
  return { hero, cities: HOME_CITY_IDS.map((id, i) => cityCover(id, lists[i] ?? [])), top, reviews };
}

/** Like Promise.all, but with at most `limit` calls in flight; results keep their order. */
export async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
