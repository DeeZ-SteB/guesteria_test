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
    const fetch = fakeFetch(ok({ data: { bookingId: "B1", status: "CONFIRMED" } }));
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
