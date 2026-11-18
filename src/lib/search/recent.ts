import { z } from "zod";
import { findCity } from "@/lib/cities";
import type { SearchQuery } from "./params";

export const RECENT_KEY = "gs:recent-searches:v1";
const MAX_RECENT = 5;

const entrySchema = z.object({
  cityId: z.string().refine((id) => !!findCity(id)),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  adults: z.number().int().min(1).max(8),
});

/** Parses stored JSON defensively: corrupt entries and past stays are dropped. */
export function parseRecent(raw: string | null, today: string): SearchQuery[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((item) => {
      const parsed = entrySchema.safeParse(item);
      return parsed.success && parsed.data.checkIn >= today ? [parsed.data] : [];
    })
    .slice(0, MAX_RECENT);
}

/** Newest first, de-duplicated by city + dates + guests. */
export function addRecent(list: SearchQuery[], entry: SearchQuery): SearchQuery[] {
  const same = (a: SearchQuery) =>
    a.cityId === entry.cityId && a.checkIn === entry.checkIn && a.checkOut === entry.checkOut && a.adults === entry.adults;
  return [entry, ...list.filter((item) => !same(item))].slice(0, MAX_RECENT);
}

// Browser storage can be missing or throw (private mode, blocked storage): never let it break the page.
export function readRecent(today: string): SearchQuery[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY), today);
  } catch {
    return [];
  }
}

export function saveRecent(entry: SearchQuery, today: string): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(addRecent(readRecent(today), entry)));
  } catch {
    /* ignore */
  }
}
