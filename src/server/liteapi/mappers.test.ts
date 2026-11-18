import { describe, expect, it } from "vitest";
import { hotelDetailsSchema, hotelListSchema, minRatesSchema, ratesSchema, reviewsSchema } from "./schemas";
import { to24h, toHotelDetails, toHotelSummaries, toReviews, toRoomOffers } from "./mappers";
import { cancellationText } from "@/lib/cancellation";
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

  it("shows the suggested selling price publicly", () => {
    expect(summaries[0].price).toEqual({ amount: 26648.98, currency: "UAH" });
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

// ---- Regressions found by the code-reviewer agent (stage 2) ----
describe("cancellation policy edge cases", () => {
  const rooms = toHotelDetails(hotelDetailsSchema.parse(details)).rooms;
  type Infos = Array<Record<string, unknown> | null>;
  const withPolicy = (refundableTag: string, cancelPolicyInfos: Infos) => {
    const copy = structuredClone(rates);
    for (const t of copy.data[0].roomTypes) {
      (t.rates[0] as Record<string, unknown>).cancellationPolicies = { refundableTag, cancelPolicyInfos, hotelRemarks: [] };
    }
    return toRoomOffers(ratesSchema.parse(copy), rooms, NOW)[0].rates[0];
  };
  const penalty = (cancelTime: string, amount: number, extra: Record<string, unknown> = {}) => ({
    cancelTime, amount, currency: "UAH", type: "amount", timezone: "GMT", ...extra,
  });

  it("never promises free cancellation when a penalty entry is malformed", () => {
    const rate = withPolicy("RFN", [penalty("2026-12-06 10:00:00", 7724), { cancelTime: "x", amount: "lots" }]);
    expect(rate).toMatchObject({ refundable: false, freeCancellationUntil: null });
  });

  it("treats an RFN rate without any penalty as free to cancel, consistently", () => {
    const rate = withPolicy("RFN", [penalty("2026-12-06 10:00:00", 0)]);
    expect(rate).toMatchObject({ refundable: true, freeCancellationUntil: null, penalty: null });
    expect(cancellationText(rate, NOW)).toBe("Безкоштовне скасування");
  });

  it("uses the earliest penalty even when the list is out of order", () => {
    const rate = withPolicy("RFN", [penalty("2026-12-08 10:00:00", 9000), penalty("2026-12-05 09:00:00", 3000)]);
    expect(rate.freeCancellationUntil).toBe("2026-12-05T09:00:00.000Z");
    expect(rate.penalty).toEqual({ amount: 3000, currency: "UAH" });
  });

  it("refuses a deadline in an unknown time zone", () => {
    const rate = withPolicy("RFN", [penalty("2026-12-05 09:00:00", 3000, { timezone: "CET" })]);
    expect(rate).toMatchObject({ refundable: false, freeCancellationUntil: null });
  });

  it("does not show a non-amount penalty (e.g. percent) as hryvnias", () => {
    const rate = withPolicy("RFN", [penalty("2026-12-06 10:00:00", 50, { type: "percent" })]);
    expect(rate.freeCancellationUntil).toBe("2026-12-06T10:00:00.000Z");
    expect(rate.penalty).toBeNull();
  });

  it("is non-refundable for NRFN regardless of entries", () => {
    expect(withPolicy("NRFN", [])).toMatchObject({ refundable: false, freeCancellationUntil: null });
  });
});

describe("fees and boards", () => {
  const rooms = toHotelDetails(hotelDetailsSchema.parse(details)).rooms;

  it("keeps valid fees when another fee entry is malformed", () => {
    const copy = structuredClone(rates);
    (copy.data[0].roomTypes[0].rates[0].retailRate.taxesAndFees as unknown[]).push({ included: "?", amount: null });
    const rate = toRoomOffers(ratesSchema.parse(copy), rooms, NOW)[0].rates[0];
    expect(rate.payAtHotel.map((f) => f.label)).toEqual(["Туристичний збір"]);
  });

  it("does not claim 'room only' when the board code is missing", () => {
    const copy = structuredClone(rates);
    delete (copy.data[0].roomTypes[0].rates[0] as Record<string, unknown>).boardType;
    (copy.data[0].roomTypes[0].rates[0] as Record<string, unknown>).boardName = "";
    const rate = toRoomOffers(ratesSchema.parse(copy), rooms, NOW)[0].rates.find((r) => r.offerId === "offer-standard-room-only");
    expect(rate?.boardLabel).toBe("Умови харчування уточнюйте в готелі");
  });

  it("never exposes our net price in public domain objects", () => {
    const rate = toRoomOffers(ratesSchema.parse(rates), rooms, NOW)[0].rates[0];
    expect(rate).not.toHaveProperty("netPrice");
    const [hotel] = toHotelSummaries(hotelListSchema.parse(hotelsList), minRatesSchema.parse(minRates));
    expect(hotel).not.toHaveProperty("netPrice");
  });
});

describe("room grouping fallback", () => {
  it("joins an unmapped rate to the room with the same name instead of duplicating it", () => {
    const rooms = toHotelDetails(hotelDetailsSchema.parse(details)).rooms;
    const copy = structuredClone(rates);
    const second = copy.data[0].roomTypes[1].rates[0] as Record<string, unknown>;
    second.mappedRoomId = 999999;
    second.name = "Standard Twin Room";
    const offers = toRoomOffers(ratesSchema.parse(copy), rooms, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0].rates).toHaveLength(2);
  });
});

describe("strict top-level shape", () => {
  it("rejects a non-array data instead of silently returning no hotels", () => {
    expect(hotelListSchema.safeParse({ data: "oops" }).success).toBe(false);
    expect(minRatesSchema.safeParse({ data: { hotelId: "x" } }).success).toBe(false);
    expect(ratesSchema.safeParse({ data: null }).success).toBe(false);
  });

  it("drops non-https images", () => {
    const copy = structuredClone(details);
    copy.data.hotelImages[0].url = "javascript:alert(1)";
    copy.data.hotelImages[1].url = "http://insecure.example/x.jpg";
    const hotel = toHotelDetails(hotelDetailsSchema.parse(copy));
    expect(hotel.images.every((i) => i.url.startsWith("https://"))).toBe(true);
    expect(hotel.images).toHaveLength(details.data.hotelImages.length - 2);
  });
});
