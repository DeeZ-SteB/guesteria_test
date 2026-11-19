import "server-only";
import type { z } from "zod";
import { fromThrown, LiteApiError, toLiteApiError } from "./errors";
import {
  bookingListSchema,
  bookingSchema,
  cancelBookingSchema,
  hotelDetailsSchema,
  hotelListSchema,
  minRatesSchema,
  prebookSchema,
  ratesSchema,
  reviewsSchema,
} from "./schemas";

export const DATA_HOST = "https://api.liteapi.travel/v3.0";
export const BOOK_HOST = "https://book.liteapi.travel/v3.0";

// Book must leave room for a reference lookup inside the page's 120 s maxDuration.
// Budget inside the page's 120 s: auth + DB (~2 s) + book 80 s + lookup 15 s (no retry) + DB.
const TIMEOUT = { data: 10_000, rates: 20_000, prebook: 120_000, book: 80_000, lookup: 15_000, bookingRead: 30_000 } as const;
const CLIENT_REFERENCE = /^gs-[0-9a-f]{24}$/;

export type Occupancy = { adults: number };
/** Currency and nationality are fixed (UAH / UA) and deliberately not caller-controlled. */
export type RatesQuery = {
  hotelIds: string[];
  checkin: string;
  checkout: string;
  occupancies: Occupancy[];
};

/** Ids that end up in a URL path: no dots, slashes or encoding tricks. */
const PATH_ID = /^[A-Za-z0-9_-]{1,64}$/;
function pathId(value: string, endpoint: string): string {
  if (!PATH_ID.test(value)) throw new LiteApiError("invalid_request", endpoint);
  return value;
}

type RequestOptions<T extends z.ZodType> = {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs: number;
  schema: T;
  /** Retry once on network errors. Only for idempotent, cheap GETs. */
  retryNetwork?: boolean;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createLiteApiClient({ apiKey, fetch = globalThis.fetch }: { apiKey: string; fetch?: FetchLike }) {
  async function request<T extends z.ZodType>(host: string, path: string, opts: RequestOptions<T>): Promise<z.infer<T>> {
    const url = new URL(host + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const endpoint = `${opts.method ?? "GET"} ${path}`;

    const attempt = async () => {
      const res = await fetch(url.toString(), {
        method: opts.method ?? "GET",
        headers: {
          "X-API-Key": apiKey,
          accept: "application/json",
          ...(opts.body ? { "content-type": "application/json" } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(opts.timeoutMs),
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (cause) {
        throw new LiteApiError("upstream", endpoint, { httpStatus: res.status, cause });
      }
      const failure = toLiteApiError(res.status, json, endpoint);
      if (failure) throw failure;
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        throw new LiteApiError("upstream", endpoint, { httpStatus: res.status, cause: parsed.error });
      }
      return parsed.data;
    };

    try {
      try {
        return await attempt();
      } catch (error) {
        const normalised = fromThrown(error, endpoint);
        if (opts.retryNetwork && normalised.kind === "network") return await attempt();
        throw normalised;
      }
    } catch (error) {
      const normalised = fromThrown(error, endpoint);
      // Never log headers or the key: endpoint + kind + code is enough to debug.
      // "No availability" is a normal search outcome, not an error.
      const log = normalised.kind === "no_availability" ? console.info : console.error;
      log(`[liteapi] ${normalised.endpoint} → ${normalised.kind}`, normalised.code ?? normalised.httpStatus ?? "");
      throw normalised;
    }
  }

  const rateDefaults = { currency: "UAH", guestNationality: "UA" };

  return {
    getHotels: (q: { countryCode: string; cityName: string; limit?: number }) =>
      request(DATA_HOST, "/data/hotels", {
        query: { countryCode: q.countryCode, cityName: q.cityName, limit: q.limit ?? 50 },
        timeoutMs: TIMEOUT.data,
        schema: hotelListSchema,
        retryNetwork: true,
      }),

    getHotel: (hotelId: string) =>
      request(DATA_HOST, "/data/hotel", {
        query: { hotelId },
        timeoutMs: TIMEOUT.data,
        schema: hotelDetailsSchema,
        retryNetwork: true,
      }),

    getReviews: (hotelId: string, limit = 20) =>
      request(DATA_HOST, "/data/reviews", {
        query: { hotelId, limit },
        timeoutMs: TIMEOUT.data,
        schema: reviewsSchema,
        retryNetwork: true,
      }),

    getMinRates: (q: RatesQuery) =>
      request(DATA_HOST, "/hotels/min-rates", {
        method: "POST",
        body: { ...q, ...rateDefaults },
        timeoutMs: TIMEOUT.rates,
        schema: minRatesSchema,
      }),

    getRates: (q: RatesQuery) =>
      request(DATA_HOST, "/hotels/rates", {
        method: "POST",
        body: { ...q, ...rateDefaults, roomMapping: true },
        timeoutMs: TIMEOUT.rates,
        schema: ratesSchema,
      }),

    /** Verified in sandbox (stage 5). */
    prebook: (offerId: string) =>
      request(BOOK_HOST, "/rates/prebook", {
        method: "POST",
        query: { timeout: 110 },
        body: { offerId, usePaymentSdk: false },
        timeoutMs: TIMEOUT.prebook,
        schema: prebookSchema,
      }),

    /** Verified in sandbox. Never retried; LiteAPI rejects a repeated clientReference with 4005. */
    book: (input: {
      prebookId: string;
      clientReference: string;
      holder: { firstName: string; lastName: string; email: string };
      guests: Array<{ occupancyNumber: number; firstName: string; lastName: string; email: string }>;
    }) =>
      request(BOOK_HOST, "/rates/book", {
        method: "POST",
        query: { timeout: 75 },
        body: { ...input, payment: { method: "ACC_CREDIT_CARD" } },
        timeoutMs: TIMEOUT.book,
        schema: bookingSchema,
      }),

    /** Resolves a book that timed out or hit 4005. Verified in sandbox (empty → `data: []`). */
    listBookingsByReference: async (clientReference: string) => {
      if (!CLIENT_REFERENCE.test(clientReference)) throw new LiteApiError("invalid_request", "GET /bookings");
      return request(BOOK_HOST, "/bookings", {
        query: { clientReference, timeout: 12 },
        timeoutMs: TIMEOUT.lookup,
        schema: bookingListSchema,
      });
    },

    /** Verified in sandbox. */
    getBooking: async (bookingId: string) =>
      request(BOOK_HOST, `/bookings/${pathId(bookingId, "GET /bookings/{id}")}`, {
        query: { timeout: 25 },
        timeoutMs: TIMEOUT.bookingRead,
        schema: bookingSchema,
      }),

    /** Verified in sandbox. */
    cancelBooking: async (bookingId: string) =>
      request(BOOK_HOST, `/bookings/${pathId(bookingId, "PUT /bookings/{id}")}`, {
        method: "PUT",
        query: { timeout: 25 },
        timeoutMs: TIMEOUT.bookingRead,
        schema: cancelBookingSchema,
      }),
  };
}

export type LiteApiClient = ReturnType<typeof createLiteApiClient>;
