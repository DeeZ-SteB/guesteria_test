import { describe, expect, it, vi } from "vitest";
import { BOOK_HOST, createLiteApiClient, DATA_HOST } from "./client";
import { LiteApiError } from "./errors";
import { liteApiErrorMessage } from "@/lib/liteapi-messages";
import { fakeFetch, ok } from "./test-utils";
import hotelsList from "./__fixtures__/hotels-list.json";
import hotelsEmpty from "./__fixtures__/hotels-list-empty.json";
import rates from "./__fixtures__/rates.json";
import ratesEmpty from "./__fixtures__/rates-empty.json";
import unauthorized from "./__fixtures__/error-unauthorized.json";
import pastDates from "./__fixtures__/error-past-dates.json";
import badOffer from "./__fixtures__/error-prebook-bad-offer.json";

vi.spyOn(console, "error").mockImplementation(() => {});

const stayQuery = { hotelIds: ["lpbbb0c"], checkin: "2026-12-09", checkout: "2026-12-12", occupancies: [{ adults: 2 }] };

async function caught(promise: Promise<unknown>): Promise<LiteApiError> {
  try {
    await promise;
  } catch (error) {
    return error as LiteApiError;
  }
  throw new Error("Expected a rejection");
}

describe("LiteAPI client: requests", () => {
  it("sends the API key header and uses the data host for search", async () => {
    const fetch = fakeFetch(ok(hotelsList));
    await createLiteApiClient({ apiKey: "test-key-123", fetch }).getHotels({ countryCode: "UA", cityName: "Lviv" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${DATA_HOST}/data/hotels?countryCode=UA&cityName=Lviv&limit=50`);
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe("test-key-123");
  });

  it("asks for UAH prices for Ukrainian guests by default", async () => {
    const fetch = fakeFetch(ok(rates));
    await createLiteApiClient({ apiKey: "k", fetch }).getRates(stayQuery);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      currency: "UAH",
      guestNationality: "UA",
      roomMapping: true,
    });
  });

  it("sends booking calls to the booking host with ACC_CREDIT_CARD (sandbox) payment", async () => {
    const { default: book } = await import("./__fixtures__/book.json");
    const fetch = fakeFetch({ status: book.httpStatus, body: book.body });
    await createLiteApiClient({ apiKey: "k", fetch }).book({
      prebookId: "P1",
      clientReference: "ref-1",
      holder: { firstName: "A", lastName: "B", email: "a@b.co" },
      guests: [{ occupancyNumber: 1, firstName: "A", lastName: "B", email: "a@b.co" }],
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url.startsWith(`${BOOK_HOST}/rates/book`)).toBe(true);
    expect(JSON.parse(String(init?.body)).payment).toEqual({ method: "ACC_CREDIT_CARD" });
  });
});

describe("LiteAPI client: errors", () => {
  it("treats HTTP 200 with error 2001 as no availability", async () => {
    const fetch = fakeFetch({ status: pastDates.httpStatus, body: pastDates.body });
    const error = await caught(createLiteApiClient({ apiKey: "k", fetch }).getRates(stayQuery));
    expect(error).toBeInstanceOf(LiteApiError);
    expect(error).toMatchObject({ kind: "no_availability", code: 2001, httpStatus: 200 });
  });

  it("maps 401 to unauthorized", async () => {
    const fetch = fakeFetch({ status: unauthorized.httpStatus, body: unauthorized.body });
    const error = await caught(createLiteApiClient({ apiKey: "bad", fetch }).getHotels({ countryCode: "UA", cityName: "Lviv" }));
    expect(error.kind).toBe("unauthorized");
  });

  it("keeps the LiteAPI code for invalid requests (stage 5 needs 4005 vs 4002)", async () => {
    const fetch = fakeFetch({ status: badOffer.httpStatus, body: badOffer.body });
    const error = await caught(createLiteApiClient({ apiKey: "k", fetch }).prebook("bad"));
    expect(error).toMatchObject({ kind: "invalid_request", code: 4002 });
  });

  it("reports invalid JSON and schema mismatches as upstream errors", async () => {
    const client = createLiteApiClient({ apiKey: "k", fetch: fakeFetch({ body: "<html>502</html>" }, ok({ data: "nope" })) });
    expect((await caught(client.getHotel("lpbbb0c"))).kind).toBe("upstream");
    expect((await caught(client.getHotel("lpbbb0c"))).kind).toBe("upstream");
  });

  it("maps an aborted request to timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const error = await caught(createLiteApiClient({ apiKey: "k", fetch: fakeFetch(timeout) }).getRates(stayQuery));
    expect(error.kind).toBe("timeout");
  });

  it("retries a GET once on a network error", async () => {
    const fetch = fakeFetch(new TypeError("fetch failed"), ok(hotelsEmpty));
    const result = await createLiteApiClient({ apiKey: "k", fetch }).getHotels({ countryCode: "UA", cityName: "X" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.hotelIds).toBe("");
  });

  it("never retries POSTs (rates are slow, bookings are not idempotent)", async () => {
    const fetch = fakeFetch(new TypeError("fetch failed"), ok(ratesEmpty));
    const error = await caught(createLiteApiClient({ apiKey: "k", fetch }).getRates(stayQuery));
    expect(error.kind).toBe("network");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("has Ukrainian copy for every error kind and never echoes supplier text", () => {
    for (const kind of ["no_availability", "unauthorized", "invalid_request", "timeout", "network", "upstream", "unknown"] as const) {
      expect(liteApiErrorMessage(kind)).toMatch(/[а-яіїєґ]/i);
    }
  });
});

// ---- Regressions found by the review agents (stage 2) ----
describe("LiteAPI client: more error branches", () => {
  it("classifies an unlisted 4xxx code by HTTP status, not as a server error", async () => {
    const fetch = fakeFetch({ status: 400, body: { error: { code: 4001, message: "x" } } });
    expect(await caught(createLiteApiClient({ apiKey: "k", fetch }).getRates(stayQuery))).toMatchObject({
      kind: "invalid_request",
      code: 4001,
    });
  });

  it("falls back to the HTTP status when the error has no numeric code", async () => {
    const fetch = fakeFetch({ status: 503, body: { error: { message: "down" } } });
    expect((await caught(createLiteApiClient({ apiKey: "k", fetch }).getRates(stayQuery))).kind).toBe("upstream");
  });

  it("does not retry a timed-out GET", async () => {
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const fetch = fakeFetch(timeout, ok(hotelsEmpty));
    expect((await caught(createLiteApiClient({ apiKey: "k", fetch }).getHotel("lpbbb0c"))).kind).toBe("timeout");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports network when the retry also fails", async () => {
    const fetch = fakeFetch(new TypeError("a"), new TypeError("b"));
    expect((await caught(createLiteApiClient({ apiKey: "k", fetch }).getHotel("lpbbb0c"))).kind).toBe("network");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects booking ids that could change the request path", async () => {
    const fetch = fakeFetch();
    const client = createLiteApiClient({ apiKey: "k", fetch });
    expect((await caught(client.getBooking(".."))).kind).toBe("invalid_request");
    expect((await caught(client.cancelBooking("a/../b"))).kind).toBe("invalid_request");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("unknown hotel (probed live: HTTP 400 / 4002)", () => {
  it("maps to invalid_request so the page can show 404", async () => {
    const { default: notFound } = await import("./__fixtures__/error-hotel-not-found.json");
    const fetch = fakeFetch({ status: notFound.httpStatus, body: notFound.body });
    expect((await caught(createLiteApiClient({ apiKey: "k", fetch }).getHotel("lpzzzzzz"))).kind).toBe("invalid_request");
  });
});

// Found by me in the browser (stage 4): errors thrown inside "use cache" come back as plain
// Error objects (name + message survive, class and fields don't), so `instanceof` failed and an
// unknown hotel showed a generic error instead of 404.
describe("reviveLiteApiError", () => {
  it("restores kind and code from an error that crossed the cache boundary", async () => {
    const { reviveLiteApiError, LiteApiError } = await import("./errors");
    const crossed = Object.assign(new Error("LiteAPI GET /data/hotel: invalid_request (4002)"), { name: "LiteApiError" });
    const revived = reviveLiteApiError(crossed);
    expect(revived).toBeInstanceOf(LiteApiError);
    expect(revived).toMatchObject({ kind: "invalid_request", code: 4002, endpoint: "GET /data/hotel" });
  });

  it("keeps real LiteApiErrors and maps anything else to unknown", async () => {
    const { reviveLiteApiError, LiteApiError } = await import("./errors");
    const real = new LiteApiError("timeout", "x");
    expect(reviveLiteApiError(real)).toBe(real);
    expect(reviveLiteApiError(new Error("boom")).kind).toBe("unknown");
    expect(reviveLiteApiError(Object.assign(new Error("LiteAPI x: hacked"), { name: "LiteApiError" })).kind).toBe("unknown");
  });
});


// ---- Stage 5: booking host verified against real sandbox responses ----
describe("booking host schemas and errors (sandbox fixtures)", () => {
  it("parses prebook, book, booking, cancel and both lookups", async () => {
    const fx = (n: string) => import(`./__fixtures__/${n}.json`).then((m) => m.default);
    const { prebookSchema, bookingSchema, bookingListSchema, cancelBookingSchema } = await import("./schemas");
    expect(prebookSchema.safeParse((await fx("prebook")).body).success).toBe(true);
    expect(bookingSchema.safeParse((await fx("book")).body).success).toBe(true);
    expect(bookingSchema.safeParse((await fx("booking")).body).success).toBe(true);
    expect(cancelBookingSchema.safeParse((await fx("cancel")).body).success).toBe(true);
    expect(bookingListSchema.parse((await fx("bookings-by-reference")).body).data).toHaveLength(1);
    expect(bookingListSchema.parse((await fx("bookings-by-reference-empty")).body).data).toEqual([]);
  });

  it("maps a repeated clientReference (4005) to its own kind", async () => {
    const { default: dup } = await import("./__fixtures__/error-book-duplicate.json");
    const fetch = fakeFetch({ status: dup.httpStatus, body: dup.body });
    const err = await caught(
      createLiteApiClient({ apiKey: "k", fetch }).book({
        prebookId: "P1",
        clientReference: "gs-0123456789abcdef01234567",
        holder: { firstName: "A", lastName: "B", email: "a@b.co" },
        guests: [{ occupancyNumber: 1, firstName: "A", lastName: "B", email: "a@b.co" }],
      }),
    );
    expect(err).toMatchObject({ kind: "duplicate", code: 4005 });
  });

  it("looks bookings up by a well-formed reference only, without the query in logs", async () => {
    const { default: empty } = await import("./__fixtures__/bookings-by-reference-empty.json");
    const fetch = fakeFetch({ status: 200, body: empty.body });
    const client = createLiteApiClient({ apiKey: "k", fetch });
    await client.listBookingsByReference("gs-0123456789abcdef01234567");
    expect(fetch.mock.calls[0][0]).toBe(`${BOOK_HOST}/bookings?clientReference=gs-0123456789abcdef01234567&timeout=12`);
    expect((await caught(client.listBookingsByReference("x&status=all"))).kind).toBe("invalid_request");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
