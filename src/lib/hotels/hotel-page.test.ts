import { describe, expect, it } from "vitest";
import { allFacilities, topFacilities, translateFacility } from "./facilities";
import { galleryImages, imageAlt, latestReviews, mapsHref, reviewLanguageLabel } from "./page";
import { cheapestRate, filterOffers, payAtHotelText } from "./rates";
import type { RateOption, Review, RoomOffer } from "./types";
import { checkoutHref, hotelHref, stayKey, validateStay } from "@/lib/search/params";
import { findCityByLiteApiName } from "@/lib/cities";
import { safeReturnTo } from "@/lib/return-to";

const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

describe("facilities", () => {
  it("translates known names and keeps unknown ones", () => {
    expect(translateFacility("Free WiFi")).toBe("Wi-Fi");
    expect(translateFacility(" Lift / Elevator ")).toBe("Ліфт");
    expect(translateFacility("Kid meals")).toBe("Kid meals");
  });

  it("picks the most useful facilities once each, in priority order", () => {
    const top = topFacilities(["Bar", "WiFi available", "Free WiFi", "Heating", "Free Parking", "Fitness facilities"], 4);
    expect(top.map((f) => f.key)).toEqual(["wifi", "parking", "fitness", "bar"]);
  });

  it("lists everything with translations first and no duplicates", () => {
    expect(allFacilities(["Kid meals", "Free WiFi", "WiFi available", "Bar"])).toEqual(["Wi-Fi", "Бар", "Kid meals"]);
  });
});

describe("gallery and links", () => {
  const img = (url: string, hd: string | null = null) => ({ url, hdUrl: hd, caption: null });
  it("keeps allowed, unique images up to the cap and drops foreign HD urls", () => {
    const ok = "https://static.cupid.travel/hotels/1.jpg";
    const out = galleryImages([img(ok, "http://evil/x.jpg"), img(ok), img("https://evil.com/2.jpg"), img("https://static.cupid.travel/hotels/3.jpg")], 60);
    expect(out.map((i) => i.url)).toEqual([ok, "https://static.cupid.travel/hotels/3.jpg"]);
    expect(out[0].hdUrl).toBeNull();
    expect(galleryImages(Array.from({ length: 100 }, (_, i) => img(`https://static.cupid.travel/h/${i}.jpg`)), 60)).toHaveLength(60);
  });

  it("builds alt text and a maps link", () => {
    expect(imageAlt("Grand", null, 0, 24)).toBe("Grand, фото 1 з 24");
    expect(imageAlt("Grand", " Lobby ", 0, 24)).toBe("Lobby");
    expect(mapsHref({ lat: 49.84, lng: 24.02 })).toBe("https://www.google.com/maps/search/?api=1&query=49.84,24.02");
    expect(mapsHref(null)).toBeNull();
  });
});

describe("reviews", () => {
  const r = (id: string, date: string | null, language: string | null = null): Review => ({
    id, date, language, score: 9, name: "A", country: null, type: null, headline: null, pros: null, cons: null,
  });
  it("shows the newest first", () => {
    expect(latestReviews([r("a", "2026-01-01"), r("b", "2026-11-01"), r("c", null), r("d", "2026-06-01")], 3).map((x) => x.id)).toEqual(["b", "d", "a"]);
  });
  it("labels foreign languages in Ukrainian and skips Ukrainian", () => {
    expect(reviewLanguageLabel("pl")).toBe("польська");
    expect(reviewLanguageLabel("en-gb")).toBe("англійська");
    expect(reviewLanguageLabel("uk")).toBeNull();
    expect(reviewLanguageLabel(null)).toBeNull();
  });
});

const rate = (offerId: string, amount: number, extra: Partial<RateOption> = {}): RateOption => ({
  offerId, boardCode: "RO", boardLabel: "Без харчування", refundable: false, freeCancellationUntil: null, penalty: null,
  price: { amount, currency: "UAH" }, payAtHotel: [], ...extra,
});
const offers: RoomOffer[] = [
  { room: null, name: "Standard", rates: [rate("a", 5000), rate("b", 6000, { boardCode: "BI", refundable: true, freeCancellationUntil: "2026-12-06T10:00:00Z" })] },
  { room: null, name: "Suite", rates: [rate("c", 9000, { boardCode: "BB" })] },
];
const NOW = new Date("2026-11-18T12:00:00Z");

describe("rates", () => {
  it("filters by breakfast and free cancellation, dropping empty rooms", () => {
    expect(filterOffers(offers, { breakfast: true, freeCancel: false }, NOW).map((o) => o.rates.map((r) => r.offerId))).toEqual([["b"], ["c"]]);
    expect(filterOffers(offers, { breakfast: true, freeCancel: true }, NOW).map((o) => o.name)).toEqual(["Standard"]);
    expect(filterOffers(offers, { breakfast: false, freeCancel: true }, new Date("2026-12-07T00:00:00Z"))).toEqual([]);
  });

  it("finds the cheapest rate", () => {
    expect(cheapestRate(offers)).toEqual({ offerId: "a", price: { amount: 5000, currency: "UAH" } });
    expect(cheapestRate([])).toBeNull();
  });

  it("describes fees paid at the hotel", () => {
    expect(plain(payAtHotelText([{ label: "Туристичний збір", amount: { amount: 523.42, currency: "UAH" } }]))).toBe(
      "+ 524 ₴ туристичний збір — сплачується в готелі",
    );
    expect(payAtHotelText([])).toBeNull();
    expect(plain(payAtHotelText([{ label: "A", amount: { amount: 10, currency: "EUR" } }, { label: "B", amount: { amount: 100, currency: "UAH" } }]))).toMatch(/€.*a, .*₴ b/);
  });
});

describe("hotel links and stay", () => {
  const stay = { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 };
  it("keeps old hotel links valid and adds the city when known", () => {
    expect(hotelHref("lp1", stay)).toBe("/hotels/lp1?checkin=2026-12-09&checkout=2026-12-12&adults=2");
    expect(hotelHref("lp1", { ...stay, cityId: "lviv" })).toBe("/hotels/lp1?checkin=2026-12-09&checkout=2026-12-12&adults=2&city=lviv");
  });

  it("builds a checkout link that survives the post-login redirect", () => {
    const offerId = "AwJ2MQ_".repeat(176) + "=="; // 1234 chars, base64url
    const href = checkoutHref({ offerId, hotelId: "lpbbb0c", stay });
    expect(safeReturnTo(href)).toBe(href);
    expect(new URLSearchParams(href.split("?")[1]).get("offerId")).toBe(offerId);
    expect(() => checkoutHref({ offerId: "../evil", hotelId: "lp1", stay })).toThrow();
  });

  it("validates stays with the search messages and keys them", () => {
    expect(validateStay({ checkIn: "2026-11-01", checkOut: "2026-11-03", adults: "2" }, "2026-11-18").errors.checkIn).toBe(
      "Дата заїзду не може бути в минулому",
    );
    expect(validateStay({ checkIn: "2026-12-09", checkOut: "2026-12-12", adults: "2" }, "2026-11-18").stay).toEqual(stay);
    expect(stayKey(stay)).toBe("2026-12-09|2026-12-12|2");
  });

  it("maps LiteAPI city names back to our cities", () => {
    expect(findCityByLiteApiName("Ternopilʼ")?.id).toBe("ternopil");
    expect(findCityByLiteApiName("Lviv")?.id).toBe("lviv");
    expect(findCityByLiteApiName("Atlantis")).toBeUndefined();
  });
});
