import type { HotelImage, Review } from "./types";
import { isAllowedImageUrl } from "./images";

export const GALLERY_MAX = 60;

/** Allowed, de-duplicated images, capped (sandbox hotels have ~150 photos). */
export function galleryImages(images: HotelImage[], max = GALLERY_MAX): HotelImage[] {
  const seen = new Set<string>();
  const out: HotelImage[] = [];
  for (const image of images) {
    if (!isAllowedImageUrl(image.url) || seen.has(image.url)) continue;
    seen.add(image.url);
    out.push({ ...image, hdUrl: isAllowedImageUrl(image.hdUrl) ? image.hdUrl : null });
    if (out.length >= max) break;
  }
  return out;
}

export function imageAlt(hotelName: string, caption: string | null, index: number, total: number): string {
  return caption?.trim() || `${hotelName}, фото ${index + 1} з ${total}`;
}

export function mapsHref(location: { lat: number; lng: number } | null): string | null {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
}

export function latestReviews(reviews: Review[], count = 3): Review[] {
  return reviews.toSorted((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, count);
}

/** "польська" for "pl"; null for Ukrainian (no tag needed). */
export function reviewLanguageLabel(code: string | null): string | null {
  if (!code) return null;
  const base = code.toLowerCase().split(/[-_]/)[0];
  if (base === "uk") return null;
  try {
    return new Intl.DisplayNames(["uk"], { type: "language" }).of(base) ?? base.toUpperCase();
  } catch {
    return base.toUpperCase();
  }
}
