import { describe, expect, it } from "vitest";
import { hotelDetailsSchema, hotelListSchema, minRatesSchema, ratesSchema, reviewsSchema } from "./schemas";
import { to24h, toHotelDetails, toHotelSummaries, toReviews, toRoomOffers } from "./mappers";
import hotelsList from "./__fixtures__/hotels-list.json";
import hotelsEmpty from "./__fixtures__/hotels-list-empty.json";
import minRates from "./__fixtures__/min-rates.json";
import details from "./__fixtures__/hotel-details.json";
import reviews from "./__fixtures__/reviews.json";
import rates from "./__fixtures__/rates.json";
import ratesEmpty from "./__fixtures__/rates-empty.json";

const NOW = new Date("2026-11-18T12:00:00Z");

describe("schemas accept real sandbox responses", () => {
  it("parses every fixture", () => {
    expect(hotelListSchema.safeParse(hotelsList).success).toBe(true);
    expect(minRatesSchema.safeParse(minRates).success).toBe(true);
    expect(hotelDetailsSchema.safeParse(details).success).toBe(true);
    expect(reviewsSchema.safeParse(reviews).success).toBe(true);
    expect(ratesSchema.safeParse(rates).success).toBe(true);
    expect(ratesSchema.safeParse(ratesEmpty).success).toBe(true);
  });

  it("copes with hotelIds as an empty string", () => {
    expect(hotelListSchema.parse(hotelsEmpty).hotelIds).toBe("");
  });

  it("drops a malformed photo instead of failing the whole hotel", () => {
    const broken = structuredClone(details);
    (broken.data.hotelImages as unknown[])[0] = { url: 42 };
    const hotel = toHotelDetails(hotelDetailsSchema.parse(broken));
    expect(hotel.images).toHaveLength(details.data.hotelImages.length - 1);
  });
});

describe("toHotelSummaries", () => {
  const summaries = toHotelSummaries(hotelListSchema.parse(hotelsList), minRatesSchema.parse(minRates));

  it("drops hotels without a price and keeps LiteAPI order", () => {
    expect(summaries.map((h) => h.id)).toEqual(["lpbbb0c", "lp55ef0", "lp301f7"]);
  });

  it("shows the suggested selling price publicly and keeps the net price", () => {
    expect(summaries[0].price).toEqual({ amount: 26648.98, currency: "UAH" });
    expect(summaries[0].netPrice).toEqual({ amount: 23173.02, currency: "UAH" });
  });
});

describe("toHotelDetails", () => {
  const hotel = toHotelDetails(hotelDetailsSchema.parse(details));

  it("turns HTML descriptions into plain paragraphs", () => {
    expect(hotel.descriptionParagraphs[0]).toBe("Luxurious Accommodation");
    expect(hotel.descriptionParagraphs.join(" ")).not.toMatch(/<[a-z]/i);
  });

  it("reads check-in/out times in 24h", () => {
    expect(hotel.checkIn).toBe("14:00");
    expect(hotel.checkOut).toBe("12:00");
  });

  it("maps rooms with photos and beds", () => {
    expect(hotel.rooms[0]).toMatchObject({ id: 1205296, name: "Standard Twin Room", sizeSqm: 20 });
    expect(hotel.rooms[0].photos.length).toBeGreaterThan(0);
    expect(hotel.rooms[0].beds[0]).toMatch(/Twin bed/);
  });
});

describe("toRoomOffers", () => {
  const rooms = toHotelDetails(hotelDetailsSchema.parse(details)).rooms;
  const offers = toRoomOffers(ratesSchema.parse(rates), rooms, NOW);

  it("groups rates by the mapped room and attaches room photos", () => {
    expect(offers).toHaveLength(1);
    expect(offers[0].room?.id).toBe(1205296);
    expect(offers[0].rates.map((r) => r.boardCode)).toEqual(["RO", "BI"]);
  });

  it("derives the free-cancellation deadline and penalty from the policy", () => {
    expect(offers[0].rates[0]).toMatchObject({
      refundable: true,
      freeCancellationUntil: "2026-12-06T10:00:00.000Z",
      penalty: { amount: 7724.34, currency: "UAH" },
      boardLabel: "Без харчування",
    });
  });

  it("lists taxes not included in the price as payable at the hotel", () => {
    expect(offers[0].rates[0].payAtHotel).toEqual([{ label: "Туристичний збір", amount: { amount: 523.42, currency: "UAH" } }]);
  });

  it("is not free to cancel once the deadline has passed", () => {
    const later = toRoomOffers(ratesSchema.parse(rates), rooms, new Date("2026-12-07T00:00:00Z"));
    expect(later[0].rates[0]).toMatchObject({ refundable: false, freeCancellationUntil: null });
  });

  it("returns nothing when there is no availability", () => {
    expect(toRoomOffers(ratesSchema.parse(ratesEmpty), rooms, NOW)).toEqual([]);
  });
});

describe("toReviews and to24h", () => {
  it("maps reviews and empty strings to null", () => {
    const [first] = toReviews(reviewsSchema.parse(reviews));
    expect(first).toMatchObject({ id: "5362390178", score: 10, name: "Paweł", headline: null });
  });

  it("converts 12h times", () => {
    expect(to24h("02:00 PM")).toBe("14:00");
    expect(to24h("12:00 AM")).toBe("00:00");
    expect(to24h("12:00 PM")).toBe("12:00");
    expect(to24h("noon")).toBeNull();
  });
});
