import { describe, expect, it } from "vitest";
import { cityCover, reviewHighlights, shortName, toHotelCards, topHotels, type HotelCard } from "./showcase";

const photo = "https://static.cupid.travel/hotels/1.jpg";
const card = (over: Partial<HotelCard>): HotelCard => ({ id: "h", name: "H", stars: 4, rating: 9, reviewCount: 500, photo, cityId: "lviv", ...over });

describe("home showcase", () => {
  it("maps hotel rows, dropping nameless rows and foreign photos", () => {
    const out = toHotelCards([{ id: "a", name: "A", rating: 9.1, reviewCount: 10, main_photo: photo }, { id: "b", name: "", main_photo: photo }, null, { id: "c", name: "C", main_photo: "https://evil.example/x.jpg" }], "lviv");
    expect(out.map((h) => h.id)).toEqual(["a", "c"]);
    expect(out[1].photo).toBeNull();
  });

  it("ranks by rating weighted by review count", () => {
    const top = topHotels([card({ id: "few", rating: 10, reviewCount: 120 }), card({ id: "many", rating: 9.2, reviewCount: 1500, cityId: "kyiv" })], { minReviews: 100 });
    expect(top.map((h) => h.id)).toEqual(["many", "few"]);
  });

  it("limits hotels per city and skips weak or photo-less ones", () => {
    const hotels = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" }), card({ id: "d", photo: null, cityId: "kyiv" }), card({ id: "e", rating: 7, cityId: "kyiv" }), card({ id: "f", reviewCount: 5, cityId: "kyiv" })];
    expect(topHotels(hotels, { perCity: 2 }).map((h) => h.id)).toEqual(["a", "b"]);
  });

  it("uses the best-rated hotel with a photo as the city cover", () => {
    const cover = cityCover("lviv", [card({ id: "a", rating: 9.5, photo: null }), card({ id: "b", rating: 8.5, photo: "https://static.cupid.travel/hotels/b.jpg" })]);
    expect(cover).toEqual({ cityId: "lviv", photo: "https://static.cupid.travel/hotels/b.jpg", hotelCount: 2 });
    expect(cityCover("x", []).photo).toBeNull();
  });

  it("picks high-scoring reviews with real text, one per hotel first", () => {
    const r = (id: string, score: number, pros: string | null) => ({ id, score, name: "Олена", country: "UA", type: null, date: null, headline: null, language: "uk", pros, cons: null });
    const long = "Чудове розташування, привітний персонал і дуже смачні сніданки щодня.";
    const out = reviewHighlights([
      { hotel: card({ id: "h1" }), reviews: [r("1", 10, long), r("2", 9.6, long), r("3", 6, long), r("4", 10, "ok")] },
      { hotel: card({ id: "h2", name: "Two" }), reviews: [r("5", 9, long)] },
    ]);
    expect(out.map((x) => x.id)).toEqual(["1", "5", "2"]);
  });

  it("skips Russian-language reviews, puts Ukrainian first and cuts text at a word", () => {
    const r = (id: string, language: string | null, pros: string) => ({ id, score: 10, name: "Гість", country: null, type: null, date: null, headline: null, language, pros, cons: null });
    const text = "Чудове місце ".repeat(30);
    const out = reviewHighlights([
      { hotel: card({ id: "h1" }), reviews: [r("en", "en", "Great location, friendly staff and a lovely breakfast every day.".repeat(2)), r("ru", "ru", "Очень понравилось, отличный завтрак и персонал, рекомендую всем."), r("uk", "uk", text)] },
    ]);
    expect(out.map((x) => x.id)).toEqual(["uk", "en"]);
    expect(out[0].text.endsWith("…")).toBe(true);
    expect(out[0].text.length).toBeLessThanOrEqual(241);
    expect(out[0].text).not.toMatch(/\s…$/);
  });
});

describe("shortName", () => {
  it("keeps the first name and an initial only", () => {
    expect(shortName("Olena  Kovalenko")).toBe("Olena K.");
    expect(shortName("Jules")).toBe("Jules");
    expect(shortName("  ")).toBe("Гість");
    expect(shortName(null)).toBe("Гість");
  });
});

describe("duplicates", () => {
  it("shows a hotel listed in two cities once, and each review once", () => {
    const h = { id: "dup", name: "D", stars: 4, rating: 9.4, reviewCount: 900, photo: "https://static.cupid.travel/x.jpg" };
    const top = topHotels([{ ...h, cityId: "lviv" }, { ...h, cityId: "kyiv" }]);
    expect(top.map((x) => x.id)).toEqual(["dup"]);
    const review = { id: "r1", name: "A B", score: 10, pros: "x".repeat(60), cons: null, language: "en", country: null, date: null, headline: null };
    const out = reviewHighlights([
      { hotel: top[0], reviews: [review] as never },
      { hotel: top[0], reviews: [review] as never },
    ]);
    expect(out.map((r) => r.id)).toEqual(["r1"]);
  });
});
