import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import type { HotelDetails, HotelSummary, Review, RoomOffer } from "@/lib/hotels/types";
import { staySchema, type Stay } from "@/lib/booking/stay";
import { findCity } from "@/lib/cities";
import { liteApiKey } from "@/server/env";
import { createLiteApiClient } from "./client";
import { LiteApiError } from "./errors";
import { toHotelDetails, toReviews } from "./mappers";
import * as service from "./service";

export { LiteApiError } from "./errors";

/** Public data API for pages and the AI assistant. Inputs are validated before any call. */

export const hotelIdSchema = z.string().regex(/^[a-z0-9]{3,32}$/i, "Invalid hotel id");

// The API key is read inside each function, never passed as an argument,
// so it can never become part of a "use cache" key.
const client = () => createLiteApiClient({ apiKey: liteApiKey() });

/** Static hotel list for a city (no prices). Cached for days. */
async function getCityHotels(countryCode: string, cityName: string) {
  "use cache";
  cacheLife("days");
  cacheTag(`city:${countryCode}:${cityName}`);
  return client().getHotels({ countryCode, cityName, limit: 50 });
}

export async function getHotel(hotelId: string): Promise<HotelDetails> {
  "use cache";
  cacheLife("days");
  cacheTag(`hotel:${hotelId}`);
  const id = hotelIdSchema.parse(hotelId);
  return toHotelDetails(await client().getHotel(id));
}

export async function getReviews(hotelId: string): Promise<Review[]> {
  "use cache";
  cacheLife("days");
  cacheTag(`hotel:${hotelId}:reviews`);
  const id = hotelIdSchema.parse(hotelId);
  return toReviews(await client().getReviews(id, 20));
}

/** Hotels with live prices for a stay. Prices are never cached. */
export async function searchHotels(input: { cityId: string } & Stay): Promise<HotelSummary[]> {
  const city = findCity(input.cityId);
  if (!city) throw new LiteApiError("invalid_request", "searchHotels");
  const stay = staySchema.parse(input);
  const hotels = await getCityHotels(city.countryCode, city.cityName);
  return service.searchHotels(client(), { hotels, stay });
}

/** Rooms and rates for a stay, with static room info attached. Never cached. */
export async function getRoomRates(hotelId: string, stayInput: Stay): Promise<RoomOffer[]> {
  const id = hotelIdSchema.parse(hotelId);
  const stay = staySchema.parse(stayInput);
  const details = await getHotel(id);
  return service.getRoomRates(client(), { hotelId: id, stay, rooms: details.rooms });
}
