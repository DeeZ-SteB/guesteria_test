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
    expect(plain(payAtHotelText([{ label: "A", amount: { amount: 10, currency: "EUR" } }, { label: "B", amount: { amount: 100, currency: "UAH" } }]))).toMatch(/€ збір, .*₴ збір/);
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

// ---- Regressions found by the security-auditor agent (stage 4) ----
import { offerIdSchema, OFFER_ID_MAX } from "@/lib/booking/offer";
import { emailSafeReturnPath } from "@/lib/return-to";

describe("offer token length vs return path", () => {
  it("the longest accepted token still produces a checkout link that survives login", () => {
    const longest = "A".repeat(OFFER_ID_MAX);
    expect(offerIdSchema.safeParse(longest).success).toBe(true);
    expect(offerIdSchema.safeParse(longest + "A").success).toBe(false);
    // Worst case incl. the price hint and the longest city id.
    const href = checkoutHref({ offerId: longest, hotelId: "abcdefghijklmnopqrstuvwxyz123456", stay: { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 8 }, price: 99_999_999, cityId: "ivano-frankivsk" });
    expect(safeReturnTo(href)).toBe(href);
  });
});

describe("emailSafeReturnPath", () => {
  it("never puts an offer token into a confirmation email; sends the guest to the hotel instead", () => {
    const next = `/checkout?offerId=${"A".repeat(1200)}&hotel=lpbbb0c&checkin=2026-12-09&checkout=2026-12-12&adults=2`;
    expect(emailSafeReturnPath(next)).toBe("/hotels/lpbbb0c?checkin=2026-12-09&checkout=2026-12-12&adults=2");
  });
  it("keeps short paths and drops anything long or unsafe", () => {
    expect(emailSafeReturnPath("/account?tab=trips")).toBe("/account?tab=trips");
    expect(emailSafeReturnPath(`/${"a".repeat(600)}`)).toBe("/");
    expect(emailSafeReturnPath("//evil.com")).toBe("/");
  });
});

// ---- Regressions found by the code-reviewer agent (stage 4) ----
import { carouselPosition, lightboxWindow, reviewMonth } from "./page";
import { hotelStayState } from "@/lib/search/params";

describe("gallery maths", () => {
  it("never repeats an image in the lightbox window (1 or 2 photos)", () => {
    expect(lightboxWindow(0, 1)).toEqual([0]);
    expect(lightboxWindow(1, 2)).toEqual([0, 1]);
    expect(lightboxWindow(0, 10)).toEqual([9, 0, 1]);
  });
  it("counts photos, not carousel slides (the «all photos» slide is not photo 11)", () => {
    expect(carouselPosition(0, 375, 10, 60)).toBe(1);
    expect(carouselPosition(375 * 10, 375, 10, 60)).toBe(10);
    expect(carouselPosition(375 * 2, 375, 10, 2)).toBe(2);
    expect(carouselPosition(0, 0, 10, 60)).toBe(1);
  });
});

describe("hotelStayState", () => {
  const today = "2026-11-18";
  it("suggests default dates when none are given, keeping adults", () => {
    expect(hotelStayState({ adults: "3" }, today)).toEqual({
      status: "none",
      values: { checkIn: "2026-12-02", checkOut: "2026-12-05", adults: "3" },
    });
  });
  it("treats a single date as invalid and validates full stays", () => {
    expect(hotelStayState({ checkin: "2026-12-09" }, today).status).toBe("invalid");
    expect(hotelStayState({ checkin: ["2026-12-09"], checkout: "2026-12-12" }, today)).toEqual({
      status: "ok",
      stay: { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 },
    });
  });
});

describe("review dates and fee text", () => {
  it("formats the review month in Ukrainian", () => {
    expect(reviewMonth("2026-11-14T00:00:00Z")).toBe("лис 2026");
    expect(reviewMonth(null)).toBeNull();
    expect(reviewMonth("garbage")).toBeNull();
  });
  it("de-duplicates fee labels and never shows raw English", () => {
    expect(plain(payAtHotelText([
      { label: "Туристичний збір", amount: { amount: 100, currency: "UAH" } },
      { label: "Туристичний збір", amount: { amount: 50, currency: "UAH" } },
      { label: "Eco charge", amount: { amount: 10, currency: "UAH" } },
    ]))).toBe("+ 160 ₴ туристичний збір, збір — сплачується в готелі");
  });
});

describe("cheapest among visible rates", () => {
  it("is computed on the filtered offers", () => {
    const filtered = filterOffers(offers, { breakfast: true, freeCancel: false }, NOW);
    expect(cheapestRate(filtered)?.offerId).toBe("b");
  });
});

describe("parseCheckoutParams", () => {
  const today = "2026-11-18";
  const offerId = "A".repeat(100);
  const ok = { offerId, hotel: "lpbbb0c", checkin: "2026-12-09", checkout: "2026-12-12", adults: "2", price: "26649", city: "lviv" };
  it("accepts a valid hand-off and keeps the price only as a hint", async () => {
    const { parseCheckoutParams } = await import("@/lib/search/params");
    expect(parseCheckoutParams(ok, today)).toEqual({
      status: "ok", offerId, hotelId: "lpbbb0c", stay: { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 }, shownPrice: 26649, cityId: "lviv",
    });
    expect(parseCheckoutParams({ ...ok, price: "-5" }, today)).toMatchObject({ shownPrice: null });
  });
  it("sends broken links back to the hotel (or home)", async () => {
    const { parseCheckoutParams } = await import("@/lib/search/params");
    expect(parseCheckoutParams({ ...ok, offerId: "../x" }, today)).toEqual({
      status: "invalid", backHref: "/hotels/lpbbb0c?checkin=2026-12-09&checkout=2026-12-12&adults=2&city=lviv",
    });
    expect(parseCheckoutParams({ ...ok, hotel: "<x>" }, today)).toEqual({ status: "invalid", backHref: "/" });
    expect(parseCheckoutParams({ ...ok, checkin: "2020-01-01" }, today)).toEqual({ status: "invalid", backHref: "/hotels/lpbbb0c" });
  });
});
