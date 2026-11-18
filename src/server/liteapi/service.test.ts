import { describe, expect, it, vi } from "vitest";
import { createLiteApiClient } from "./client";
import { hotelListSchema } from "./schemas";
import { getRoomRates, searchHotels } from "./service";
import { fakeFetch, ok } from "./test-utils";
import hotelsList from "./__fixtures__/hotels-list.json";
import hotelsEmpty from "./__fixtures__/hotels-list-empty.json";
import minRates from "./__fixtures__/min-rates.json";
import pastDates from "./__fixtures__/error-past-dates.json";
import unauthorized from "./__fixtures__/error-unauthorized.json";

vi.spyOn(console, "error").mockImplementation(() => {});

const stay = { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 };

describe("searchHotels", () => {
  it("joins the hotel list with min-rates for the stay", async () => {
    const fetch = fakeFetch(ok(minRates));
    const result = await searchHotels(createLiteApiClient({ apiKey: "k", fetch }), {
      hotels: hotelListSchema.parse(hotelsList),
      stay,
    });
    expect(result.map((h) => h.name)).toEqual([
      "Grand Hotel Lviv Casino & Spa",
      "Lion's Castle Hotel",
      "Premier Hotel Dnister",
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      hotelIds: ["lpbbb0c", "lp55ef0", "lp301f7", "lp655763fa"],
      checkin: "2026-12-09",
      checkout: "2026-12-12",
      occupancies: [{ adults: 2 }],
    });
  });

  it("does not call min-rates when the city has no hotels", async () => {
    const fetch = fakeFetch();
    const result = await searchHotels(createLiteApiClient({ apiKey: "k", fetch }), {
      hotels: hotelListSchema.parse(hotelsEmpty),
      stay,
    });
    expect(result).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns 'no availability' into an empty result, not an error", async () => {
    const fetch = fakeFetch({ status: pastDates.httpStatus, body: pastDates.body });
    const result = await searchHotels(createLiteApiClient({ apiKey: "k", fetch }), {
      hotels: hotelListSchema.parse(hotelsList),
      stay,
    });
    expect(result).toEqual([]);
  });

  it("still surfaces real failures", async () => {
    const fetch = fakeFetch({ status: unauthorized.httpStatus, body: unauthorized.body });
    await expect(
      searchHotels(createLiteApiClient({ apiKey: "k", fetch }), { hotels: hotelListSchema.parse(hotelsList), stay }),
    ).rejects.toMatchObject({ kind: "unauthorized" });
  });
});

describe("getRoomRates", () => {
  it("returns no rooms on 'no availability'", async () => {
    const fetch = fakeFetch({ status: pastDates.httpStatus, body: pastDates.body });
    const result = await getRoomRates(createLiteApiClient({ apiKey: "k", fetch }), { hotelId: "lpbbb0c", stay, rooms: [] });
    expect(result).toEqual([]);
  });
});
