import "server-only";
import { cacheLife, cacheTag, updateTag } from "next/cache";
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
import { toHotelCards, type HotelCard } from "@/lib/home/showcase";

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

export type Cached<T> = { ok: true; value: T } | { ok: false; kind: LiteApiErrorKind; code?: number };

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

// ---------- short-lived price caches ----------
//
// Search prices and room rates are cached briefly so repeated searches and hotel pages answer at
// once. Safe for money: the price a guest pays is always re-checked live by prebook at checkout
// (with a "price changed" banner), and a rate that turned out to be gone drops the hotel's rates
// cache (forgetRoomRates, from the checkout page's "back to the hotel" action).
// Failures are never served from these caches: a transient LiteAPI error is retried live, once,
// outside the cache (as before caching), so "retry" really retries.
// These caches are shared by all users: their arguments must stay city/hotel, dates and adults only
// (currency and guest nationality are fixed in client.ts) — never add anything per-user here.

/** Search prices: fresh for 1 min, refreshed in the background, never older than 4 min. */
export const SEARCH_PRICES = { stale: 60, revalidate: 90, expire: 240 } as const;
/** Room rates carry offer ids for checkout: keep them young. */
export const ROOM_RATES = { stale: 30, revalidate: 60, expire: 180 } as const;
/** "Nothing available" may change soon (cancellations): keep it for a minute at most. */
export const EMPTY_RESULT = { stale: 30, revalidate: 30, expire: 60 } as const;

/** A failure leaves the cache within seconds (callers retry it live anyway, see priceRead). */
export const FAILED = { stale: 0, revalidate: 1, expire: 10 } as const;

type Life = typeof SEARCH_PRICES | typeof ROOM_RATES | typeof EMPTY_RESULT | typeof FAILED;

/** Cache lifetime for a price result: the profile for data, a minute for empty, seconds for failures. */
export function priceLife(result: Cached<readonly unknown[]>, profile: typeof SEARCH_PRICES | typeof ROOM_RATES): Life {
  if (!result.ok) return FAILED;
  return result.value.length === 0 ? EMPTY_RESULT : profile;
}

/** Failures worth an immediate live retry (not "bad input" or "nothing available"). */
export const isTransient = (r: Cached<unknown>) => !r.ok && r.kind !== "invalid_request" && r.kind !== "no_availability";

async function loadSearch(cityId: string, checkIn: string, checkOut: string, adults: number): Promise<Cached<HotelSummary[]>> {
  const city = findCity(cityId);
  if (!city) return { ok: false, kind: "invalid_request" };
  const list = await cachedCityHotels(city.countryCode, city.cityName);
  if (!list.ok) return list;
  try {
    return { ok: true, value: await service.searchHotels(client(), { hotels: list.value, stay: { checkIn, checkOut, adults } }) };
  } catch (error) {
    return failure(error);
  }
}

async function cachedSearch(cityId: string, checkIn: string, checkOut: string, adults: number): Promise<Cached<HotelSummary[]>> {
  "use cache";
  const result = await loadSearch(cityId, checkIn, checkOut, adults);
  cacheLife(priceLife(result, SEARCH_PRICES));
  return result;
}

async function loadRoomRates(hotelId: string, checkIn: string, checkOut: string, adults: number): Promise<Cached<RoomOffer[]>> {
  const details = await cachedHotel(hotelId);
  if (!details.ok) return details;
  try {
    return { ok: true, value: await service.getRoomRates(client(), { hotelId, stay: { checkIn, checkOut, adults }, rooms: details.value.rooms }) };
  } catch (error) {
    return failure(error);
  }
}

async function cachedRoomRates(hotelId: string, checkIn: string, checkOut: string, adults: number): Promise<Cached<RoomOffer[]>> {
  "use cache";
  cacheTag(`rates:${hotelId}`);
  const result = await loadRoomRates(hotelId, checkIn, checkOut, adults);
  cacheLife(priceLife(result, ROOM_RATES));
  return result;
}

/** Reads a cached result; config errors thrown before a cached function's try are revived here. */
async function settle<T>(load: () => Promise<Cached<T>>): Promise<Cached<T>> {
  try {
    return await load();
  } catch (error) {
    throw reviveLiteApiError(error);
  }
}

/** Unwraps a result into a value or a LiteApiError (thrown here, outside the cache). */
function unwrap<T>(result: Cached<T>, endpoint: string): T {
  if (result.ok) return result.value;
  throw new LiteApiError(result.kind, endpoint, { code: result.code });
}

async function fromCache<T>(load: () => Promise<Cached<T>>, endpoint: string): Promise<T> {
  return unwrap(await settle(load), endpoint);
}

/** A price read: cached, but a cached transient failure is retried live once (never shared). */
async function priceRead<T>(cached: () => Promise<Cached<T>>, live: () => Promise<Cached<T>>, endpoint: string): Promise<T> {
  const first = await settle(cached);
  return unwrap(isTransient(first) ? await settle(live) : first, endpoint);
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

/** Static hotel cards of a city for the home page (no prices; cached for days with the hotel list). */
export async function getCityHotelCards(cityId: string): Promise<HotelCard[]> {
  const city = findCity(cityId) ?? invalid("getCityHotelCards");
  const list = await fromCache(() => cachedCityHotels(city.countryCode, city.cityName), "getCityHotelCards");
  return toHotelCards(list.data, city.id);
}

/** Hotels with prices for a stay (briefly cached, see SEARCH_PRICES). */
export async function searchHotels(input: { cityId: string } & Stay): Promise<HotelSummary[]> {
  const city = findCity(input.cityId) ?? invalid("searchHotels");
  const stay = parseStay(input, "searchHotels");
  return priceRead(
    () => cachedSearch(city.id, stay.checkIn, stay.checkOut, stay.adults),
    () => loadSearch(city.id, stay.checkIn, stay.checkOut, stay.adults),
    "searchHotels",
  );
}

/** Rooms and rates for a stay, with static room info attached (briefly cached, see ROOM_RATES). */
export async function getRoomRates(hotelId: string, stayInput: Stay): Promise<RoomOffer[]> {
  const id = parseHotelId(hotelId, "getRoomRates");
  const stay = parseStay(stayInput, "getRoomRates");
  return priceRead(
    () => cachedRoomRates(id, stay.checkIn, stay.checkOut, stay.adults),
    () => loadRoomRates(id, stay.checkIn, stay.checkOut, stay.adults),
    "getRoomRates",
  );
}

/** Drops a hotel's cached rates (all stays) — a rate turned out to be gone. Server Actions only. */
export function forgetRoomRates(hotelId: string): void {
  updateTag(`rates:${parseHotelId(hotelId, "forgetRoomRates")}`);
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
