import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import type { HotelDetails, HotelSummary, Review, RoomOffer } from "@/lib/hotels/types";
import { isPastCheckIn, isTooFarAhead, staySchema, type Stay } from "@/lib/booking/stay";
import { findCity } from "@/lib/cities";
import { liteApiKey } from "@/server/env";
import { createLiteApiClient } from "./client";
import { LiteApiError } from "./errors";
import { toHotelDetails, toReviews } from "./mappers";
import * as service from "./service";

export { LiteApiError } from "./errors";

/**
 * Public data API for pages and the AI assistant.
 * Every input is validated in an uncached wrapper first, so invalid input never reaches
 * LiteAPI, a cache key or a cache tag. All failures are `LiteApiError`; callers show
 * `liteApiErrorMessage(error.kind)` and never the error object itself.
 */

export const hotelIdSchema = z.string().regex(/^[a-z0-9]{3,32}$/i);

// Read inside each function, never passed in: the key can't become part of a cache key.
const client = () => createLiteApiClient({ apiKey: liteApiKey() });

function invalid(endpoint: string): never {
  throw new LiteApiError("invalid_request", endpoint);
}

function parseHotelId(hotelId: string, endpoint: string): string {
  const parsed = hotelIdSchema.safeParse(hotelId);
  return parsed.success ? parsed.data : invalid(endpoint);
}

/** Validates a stay and rejects a check-in before today (Kyiv). */
function parseStay(input: Stay, endpoint: string): Stay {
  const parsed = staySchema.safeParse(input);
  if (!parsed.success || isPastCheckIn(parsed.data.checkIn) || isTooFarAhead(parsed.data.checkIn)) invalid(endpoint);
  return parsed.data;
}

// ---------- cached static data (no prices, no user data) ----------

async function cachedCityHotels(countryCode: string, cityName: string) {
  "use cache";
  cacheLife("days");
  cacheTag(`city:${countryCode}:${cityName}`);
  return client().getHotels({ countryCode, cityName, limit: 50 });
}

async function cachedHotel(id: string): Promise<HotelDetails> {
  "use cache";
  cacheLife("days");
  cacheTag(`hotel:${id}`);
  return toHotelDetails(await client().getHotel(id));
}

async function cachedReviews(id: string): Promise<Review[]> {
  "use cache";
  cacheLife("days");
  cacheTag(`hotel:${id}:reviews`);
  return toReviews(await client().getReviews(id, 20));
}

// ---------- public API ----------

export async function getHotel(hotelId: string): Promise<HotelDetails> {
  return cachedHotel(parseHotelId(hotelId, "getHotel"));
}

export async function getReviews(hotelId: string): Promise<Review[]> {
  return cachedReviews(parseHotelId(hotelId, "getReviews"));
}

/** Hotels with live prices for a stay. Prices are never cached. */
export async function searchHotels(input: { cityId: string } & Stay): Promise<HotelSummary[]> {
  const city = findCity(input.cityId) ?? invalid("searchHotels");
  const stay = parseStay(input, "searchHotels");
  const hotels = await cachedCityHotels(city.countryCode, city.cityName);
  return service.searchHotels(client(), { hotels, stay });
}

/** Rooms and rates for a stay, with static room info attached. Never cached. */
export async function getRoomRates(hotelId: string, stayInput: Stay): Promise<RoomOffer[]> {
  const id = parseHotelId(hotelId, "getRoomRates");
  const stay = parseStay(stayInput, "getRoomRates");
  const details = await cachedHotel(id);
  return service.getRoomRates(client(), { hotelId: id, stay, rooms: details.rooms });
}
