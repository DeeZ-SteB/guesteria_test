import { isAllowedImageUrl } from "@/lib/hotels/images";
import type { Review } from "@/lib/hotels/types";

/** A hotel for the home page (static data only — no prices, so it can be cached for hours). */
export type HotelCard = {
  id: string;
  name: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number;
  photo: string | null;
  cityId: string;
};

export type CityShowcase = { cityId: string; photo: string | null; hotelCount: number };

const usablePhoto = (url: string | null | undefined) => (isAllowedImageUrl(url) && url.length <= 500 ? url : null);

/** Hotel list rows (from LiteAPI /data/hotels) → cards; rows without a name are dropped. */
export function toHotelCards(
  rows: ReadonlyArray<{ id: string; name?: string | null; stars?: number | null; rating?: number | null; reviewCount?: number | null; main_photo?: string | null; thumbnail?: string | null } | null>,
  cityId: string,
): HotelCard[] {
  return rows.flatMap((h) =>
    h && h.name
      ? [{ id: h.id, name: h.name.slice(0, 200), stars: h.stars ?? null, rating: h.rating ?? null, reviewCount: h.reviewCount ?? 0, photo: usablePhoto(h.main_photo ?? h.thumbnail), cityId }]
      : [],
  );
}

/** Rating weighted by how many reviews back it (a 10/10 with 3 reviews ranks below 9.2 with 1 500). */
export const score = (h: HotelCard) => (h.rating ?? 0) * Math.min(1, Math.log10(h.reviewCount + 1) / 3);

/** The city's cover: the photo of its best-rated hotel that has one. */
export function cityCover(cityId: string, hotels: HotelCard[]): CityShowcase {
  const best = [...hotels].filter((h) => h.photo).sort((a, b) => score(b) - score(a))[0];
  return { cityId, photo: best?.photo ?? null, hotelCount: hotels.length };
}

/** Top hotels across cities: well reviewed, with a photo, at most `perCity` from one city. */
export function topHotels(hotels: HotelCard[], { limit = 8, perCity = 2, minReviews = 100 } = {}): HotelCard[] {
  const taken = new Map<string, number>();
  const ids = new Set<string>(); // a hotel can come back in two cities' lists
  const out: HotelCard[] = [];
  for (const h of [...hotels].filter((x) => x.photo && x.reviewCount >= minReviews && (x.rating ?? 0) >= 8).sort((a, b) => score(b) - score(a))) {
    if (ids.has(h.id)) continue;
    ids.add(h.id);
    const n = taken.get(h.cityId) ?? 0;
    if (n >= perCity) continue;
    taken.set(h.cityId, n + 1);
    out.push(h);
    if (out.length === limit) break;
  }
  return out;
}

export type ReviewHighlight = { id: string; hotelId: string; hotelName: string; cityId: string; score: number; name: string; text: string };

/** The guests' warmest words: high scores with a substantial "pros" text, one per hotel first. */
export function reviewHighlights(sources: Array<{ hotel: HotelCard; reviews: Review[] }>, limit = 6): ReviewHighlight[] {
  const candidates = sources.flatMap(({ hotel, reviews }) =>
    reviews
      // Ukrainian audience: Russian-language reviews are not shown on the home page.
      .filter((r) => (r.score ?? 0) >= 9 && (r.pros ?? "").trim().length >= 40 && !(r.language ?? "").toLowerCase().startsWith("ru"))
      .sort((a, b) => Number((b.language ?? "").startsWith("uk")) - Number((a.language ?? "").startsWith("uk")))
      .map((r) => ({
        id: r.id,
        hotelId: hotel.id,
        hotelName: hotel.name,
        cityId: hotel.cityId,
        score: r.score as number,
        name: shortName(r.name),
        text: clip((r.pros as string).trim().replace(/\s+/g, " "), 240),
      })),
  );
  const unique = new Set<string>();
  const deduped = candidates.filter((c) => (unique.has(c.id) ? false : (unique.add(c.id), true)));
  const seen = new Set<string>();
  const firstPerHotel = deduped.filter((c) => (seen.has(c.hotelId) ? false : (seen.add(c.hotelId), true)));
  const rest = deduped.filter((c) => !firstPerHotel.includes(c));
  return [...firstPerHotel, ...rest].slice(0, limit);
}

/** "Olena Kovalenko" → "Olena K." — the public home page shows no full names. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Гість";
  const first = parts[0].slice(0, 40);
  return parts.length > 1 ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}

/** Shortens at a word boundary with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?—-]+$/, "")}…`;
}
