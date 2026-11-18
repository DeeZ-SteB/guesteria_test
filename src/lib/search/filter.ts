import type { HotelSummary } from "@/lib/hotels/types";
import type { ViewState } from "./params";

function matches(hotel: HotelSummary, view: ViewState): boolean {
  if (view.price) {
    const amount = Math.ceil(hotel.price.amount);
    if (amount < view.price.min || amount > view.price.max) return false;
  }
  if (view.stars.length && (hotel.stars == null || !view.stars.includes(Math.round(hotel.stars)))) return false;
  if (view.rating && (hotel.rating == null || hotel.rating < view.rating)) return false;
  return true;
}

/** Missing values always sort last, whatever the direction. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * direction;
}

/** Filters, then sorts stably. "Recommended" keeps LiteAPI's order. */
export function applyView(hotels: HotelSummary[], view: ViewState): HotelSummary[] {
  const filtered = hotels.filter((h) => matches(h, view));
  switch (view.sort) {
    case "price_asc":
      return filtered.toSorted((a, b) => a.price.amount - b.price.amount);
    case "price_desc":
      return filtered.toSorted((a, b) => b.price.amount - a.price.amount);
    case "rating_desc":
      return filtered.toSorted((a, b) => compareNullable(a.rating, b.rating, -1));
    default:
      return filtered;
  }
}

export function countMatching(hotels: HotelSummary[], view: ViewState): number {
  return hotels.filter((h) => matches(h, view)).length;
}

/** Price slider bounds, rounded outward to 100 ₴. */
export function priceBounds(hotels: HotelSummary[]): { min: number; max: number } | null {
  if (hotels.length === 0) return null;
  const amounts = hotels.map((h) => h.price.amount);
  return { min: Math.floor(Math.min(...amounts) / 100) * 100, max: Math.ceil(Math.max(...amounts) / 100) * 100 };
}

export function activeFilterCount(view: ViewState): number {
  return (view.price ? 1 : 0) + (view.stars.length ? 1 : 0) + (view.rating ? 1 : 0);
}
