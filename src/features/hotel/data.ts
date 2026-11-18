import "server-only";
import { cache } from "react";
import { getRoomRates, LiteApiError } from "@/server/liteapi";
import type { RoomOffer } from "@/lib/hotels/types";
import type { LiteApiErrorKind } from "@/lib/liteapi-messages";

export type RatesResult = { offers: RoomOffer[] } | { error: LiteApiErrorKind };

/**
 * Live rates for one render. React.cache de-duplicates the call between the rooms list and the
 * booking summary (one LiteAPI request per page view). Errors become a kind, never an object.
 */
export const loadRates = cache(async (hotelId: string, checkIn: string, checkOut: string, adults: number): Promise<RatesResult> => {
  try {
    return { offers: await getRoomRates(hotelId, { checkIn, checkOut, adults }) };
  } catch (error) {
    return { error: error instanceof LiteApiError ? error.kind : "unknown" };
  }
});
