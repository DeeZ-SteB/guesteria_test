import { z } from "zod";

/** A heart tapped while signed out: replayed once after login. */
export const PENDING_FAVORITE_KEY = "gs:pending-favorite:v1";
const TTL_MS = 10 * 60 * 1000;

const schema = z.object({ hotelId: z.string().regex(/^[a-z0-9]{3,32}$/i), at: z.number() });
export type PendingFavorite = z.infer<typeof schema>;

export function parsePending(raw: string | null, now: number): PendingFavorite | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success || now - parsed.data.at > TTL_MS || parsed.data.at > now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function storePending(hotelId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_FAVORITE_KEY, JSON.stringify({ hotelId, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** Reads and removes the intent, so it is applied at most once. */
export function takePending(): PendingFavorite | null {
  try {
    const value = parsePending(window.sessionStorage.getItem(PENDING_FAVORITE_KEY), Date.now());
    window.sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  try {
    window.sessionStorage.removeItem(PENDING_FAVORITE_KEY);
  } catch {
    /* ignore */
  }
}
