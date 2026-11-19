import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import type { HotelDetails, HotelSummary, Review, RoomOffer } from "@/lib/hotels/types";
import type { LiteApiErrorKind } from "@/lib/liteapi-messages";
import type { HotelListResponse } from "./schemas";
import { isPastCheckIn, isTooFarAhead, staySchema, type Stay } from "@/lib/booking/stay";
import { findCity } from "@/lib/cities";
import { liteApiHosts, liteApiKey } from "@/server/env";
import { createLiteApiClient } from "./client";
import { LiteApiError, reviveLiteApiError } from "./errors";
import { toBookingState, toCancelOutcome, toCheckoutQuote, toConfirmedBooking, toHotelDetails, toReviews, type CancelOutcome } from "./mappers";
export type { CancelOutcome } from "./mappers";
import { offerIdSchema } from "@/lib/booking/offer";
import type { CheckoutQuote, ConfirmedBooking, Guest } from "@/lib/booking/checkout";
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
const client = () => createLiteApiClient({ apiKey: liteApiKey(), hosts: liteApiHosts() });

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
//
// Cached functions never throw LiteAPI errors across the cache boundary (React serialises errors
// there, and in production may keep only a digest). They return a plain result instead; the
// lifetime depends on the outcome: days for data, minutes for "not found / invalid" (so random
// ids don't hit LiteAPI every time), seconds for transient failures.

type Cached<T> = { ok: true; value: T } | { ok: false; kind: LiteApiErrorKind; code?: number };

function failure(error: unknown): Cached<never> {
  const e = reviveLiteApiError(error);
  return { ok: false, kind: e.kind, code: e.code };
}

async function cachedCityHotels(countryCode: string, cityName: string): Promise<Cached<HotelListResponse>> {
  "use cache";
  cacheTag(`city:${countryCode}:${cityName}`);
  try {
    const value = await client().getHotels({ countryCode, cityName, limit: 50 });
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    cacheLife("seconds");
    return failure(error);
  }
}

async function cachedHotel(id: string): Promise<Cached<HotelDetails>> {
  "use cache";
  cacheTag(`hotel:${id}`);
  try {
    const value = toHotelDetails(await client().getHotel(id));
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    const result = failure(error);
    if (result.ok === false && result.kind === "invalid_request") cacheLife("minutes");
    else cacheLife("seconds");
    return result;
  }
}

async function cachedReviews(id: string): Promise<Cached<Review[]>> {
  "use cache";
  cacheTag(`hotel:${id}:reviews`);
  try {
    const value = toReviews(await client().getReviews(id, 20));
    cacheLife("days");
    return { ok: true, value };
  } catch (error) {
    cacheLife("seconds");
    return failure(error);
  }
}

/** Unwraps a cached result into a value or a LiteApiError (thrown here, outside the cache). */
async function fromCache<T>(load: () => Promise<Cached<T>>, endpoint: string): Promise<T> {
  let result: Cached<T>;
  try {
    result = await load();
  } catch (error) {
    throw reviveLiteApiError(error); // e.g. config errors thrown before the try
  }
  if (result.ok) return result.value;
  throw new LiteApiError(result.kind, endpoint, { code: result.code });
}

// ---------- public API ----------

export async function getHotel(hotelId: string): Promise<HotelDetails> {
  const id = parseHotelId(hotelId, "getHotel");
  return fromCache(() => cachedHotel(id), "getHotel");
}

export async function getReviews(hotelId: string): Promise<Review[]> {
  const id = parseHotelId(hotelId, "getReviews");
  return fromCache(() => cachedReviews(id), "getReviews");
}

/** Hotels with live prices for a stay. Prices are never cached. */
export async function searchHotels(input: { cityId: string } & Stay): Promise<HotelSummary[]> {
  const city = findCity(input.cityId) ?? invalid("searchHotels");
  const stay = parseStay(input, "searchHotels");
  const hotels = await fromCache(() => cachedCityHotels(city.countryCode, city.cityName), "searchHotels");
  return service.searchHotels(client(), { hotels, stay });
}

/** Rooms and rates for a stay, with static room info attached. Never cached. */
export async function getRoomRates(hotelId: string, stayInput: Stay): Promise<RoomOffer[]> {
  const id = parseHotelId(hotelId, "getRoomRates");
  const stay = parseStay(stayInput, "getRoomRates");
  const details = await fromCache(() => cachedHotel(id), "getRoomRates");
  return service.getRoomRates(client(), { hotelId: id, stay, rooms: details.rooms });
}

// ---------- booking (never cached; server-only callers check the session first) ----------

/** Prebook an offer and return the quote to show. Validates the token shape first. */
export async function prebookOffer(offerId: string): Promise<CheckoutQuote> {
  if (!offerIdSchema.safeParse(offerId).success) invalid("prebookOffer");
  return toCheckoutQuote(await client().prebook(offerId));
}

/** Book once. Never retried here: the caller resolves timeouts / 4005 via the reference. */
export async function bookPrebook(input: {
  prebookId: string;
  clientReference: string;
  occupancyNumber: number;
  guest: Guest;
}): Promise<ConfirmedBooking> {
  const person = { firstName: input.guest.firstName, lastName: input.guest.lastName, email: input.guest.email };
  const result = await client().book({
    prebookId: input.prebookId,
    clientReference: input.clientReference,
    holder: person,
    guests: [{ occupancyNumber: input.occupancyNumber, ...person }],
  });
  return toConfirmedBooking(result.data);
}

export async function findBookingsByReference(clientReference: string): Promise<ConfirmedBooking[]> {
  const result = await client().listBookingsByReference(clientReference);
  return result.data.map(toConfirmedBooking);
}

/**
 * Cancels a booking at LiteAPI. CALLERS MUST first check ownership with getOwnBooking
 * (SPEC §11.3): LiteAPI ids are not secret enough to be trusted on their own.
 * Re-cancelling an already cancelled booking answers CANCELLED again (verified in sandbox).
 */
export async function cancelBookingAtLiteApi(liteapiBookingId: string): Promise<CancelOutcome> {
  return toCancelOutcome((await client().cancelBooking(liteapiBookingId)).data);
}

/** Current status at LiteAPI, used to reconcile a cancel whose outcome is unknown. Same ownership rule. */
export async function getLiteApiBookingStatus(liteapiBookingId: string): Promise<"confirmed" | "cancelled" | "other"> {
  const { data } = await client().getBooking(liteapiBookingId, { timeoutMs: 15_000 });
  return toBookingState(data.status);
}
