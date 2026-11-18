import { describe, expect, it } from "vitest";
import type { HotelSummary } from "@/lib/hotels/types";
import { DEFAULT_VIEW, hotelHref, parseSearchParams, parseView, searchHref, type ViewState } from "./params";
import { activeFilterCount, applyView, countMatching, priceBounds } from "./filter";

const TODAY = "2026-11-18";
const ok = { city: "lviv", checkin: "2026-12-09", checkout: "2026-12-12", adults: "2" };

describe("parseSearchParams", () => {
  it("is empty when no search params are present (start state)", () => {
    expect(parseSearchParams({}, TODAY)).toEqual({ status: "empty" });
    expect(parseSearchParams({ sort: "price_asc" }, TODAY)).toEqual({ status: "empty" });
  });

  it("parses a valid search and its view", () => {
    const result = parseSearchParams({ ...ok, sort: "price_asc", stars: "5,4,4", rating: "9", price: "1000-5000" }, TODAY);
    expect(result).toEqual({
      status: "ok",
      query: { cityId: "lviv", checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 },
      view: { sort: "price_asc", stars: [4, 5], rating: 9, price: { min: 1000, max: 5000 } },
    });
  });

  it("takes the first value of repeated params", () => {
    const result = parseSearchParams({ ...ok, city: ["kyiv", "lviv"] }, TODAY);
    expect(result.status === "ok" && result.query.cityId).toBe("kyiv");
  });

  it("reports field errors in Ukrainian", () => {
    const result = parseSearchParams({ city: "atlantis", checkin: "2026-11-01", checkout: "2026-11-03", adults: "2" }, TODAY);
    expect(result).toMatchObject({
      status: "invalid",
      errors: { city: "Оберіть місто зі списку", checkIn: "Дата заїзду не може бути в минулому" },
    });
  });

  it("rejects stays over 30 nights and check-out before check-in", () => {
    expect(parseSearchParams({ ...ok, checkout: "2027-01-20" }, TODAY)).toMatchObject({ errors: { checkOut: "Максимум 30 ночей" } });
    expect(parseSearchParams({ ...ok, checkout: "2026-12-01" }, TODAY)).toMatchObject({
      errors: { checkOut: "Дата виїзду має бути пізніше за дату заїзду" },
    });
  });

  it("ignores junk view params instead of failing the search", () => {
    expect(parseView(new URLSearchParams("sort=hack&stars=9,x,3&rating=7&price=5000-100"))).toEqual({
      ...DEFAULT_VIEW,
      stars: [3],
    });
  });

  it("round-trips through searchHref", () => {
    const view: ViewState = { sort: "rating_desc", price: { min: 2000, max: 9000 }, stars: [4], rating: 8 };
    const result = parseSearchParams(
      Object.fromEntries(new URLSearchParams(searchHref({ cityId: "lviv", checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 }, view).slice(2))),
      TODAY,
    );
    expect(result).toMatchObject({ status: "ok", view });
  });

  it("omits defaults from URLs and builds hotel links with the stay", () => {
    expect(searchHref({ cityId: "lviv", checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 })).toBe(
      "/?city=lviv&checkin=2026-12-09&checkout=2026-12-12&adults=2",
    );
    expect(hotelHref("lp1", { checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 })).toBe(
      "/hotels/lp1?checkin=2026-12-09&checkout=2026-12-12&adults=2",
    );
  });
});

const hotel = (id: string, amount: number, stars: number | null, rating: number | null): HotelSummary => ({
  id, name: id, stars, rating, reviewCount: 0, address: null, photo: null, location: null, price: { amount, currency: "UAH" },
});
const hotels = [hotel("a", 6000, 4, 8.9), hotel("b", 3000, 3, null), hotel("c", 9000, 5, 9.4), hotel("d", 4500, null, 7.5)];

describe("applyView", () => {
  it("keeps LiteAPI order for recommended", () => {
    expect(applyView(hotels, DEFAULT_VIEW).map((h) => h.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts by price both ways and by rating with missing ratings last", () => {
    expect(applyView(hotels, { ...DEFAULT_VIEW, sort: "price_asc" }).map((h) => h.id)).toEqual(["b", "d", "a", "c"]);
    expect(applyView(hotels, { ...DEFAULT_VIEW, sort: "price_desc" }).map((h) => h.id)).toEqual(["c", "a", "d", "b"]);
    expect(applyView(hotels, { ...DEFAULT_VIEW, sort: "rating_desc" }).map((h) => h.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("filters by stars (any of), minimum rating and price range", () => {
    expect(applyView(hotels, { ...DEFAULT_VIEW, stars: [4, 5] }).map((h) => h.id)).toEqual(["a", "c"]);
    expect(applyView(hotels, { ...DEFAULT_VIEW, rating: 9 }).map((h) => h.id)).toEqual(["c"]);
    expect(applyView(hotels, { ...DEFAULT_VIEW, price: { min: 4000, max: 6000 } }).map((h) => h.id)).toEqual(["a", "d"]);
  });

  it("does not mutate the input", () => {
    const copy = [...hotels];
    applyView(hotels, { ...DEFAULT_VIEW, sort: "price_asc" });
    expect(hotels).toEqual(copy);
  });
});

describe("facets", () => {
  it("counts matches, bounds prices to 100 ₴ and counts active filters", () => {
    expect(countMatching(hotels, { ...DEFAULT_VIEW, rating: 8 })).toBe(2);
    expect(priceBounds([hotel("x", 3049.5, 3, 8), hotel("y", 9001, 3, 8)])).toEqual({ min: 3000, max: 9100 });
    expect(priceBounds([])).toBeNull();
    expect(activeFilterCount({ ...DEFAULT_VIEW, stars: [4], rating: 9 })).toBe(2);
  });
});

// ---- Regressions found by the code-reviewer agent (stage 3) ----
import { clampPrice } from "./filter";
import { findCityByName } from "@/lib/cities";
import { searchKey, validateSearch } from "./params";

describe("clampPrice", () => {
  const bounds = { min: 3000, max: 9000 };
  it("clamps a shared/stale URL range into the current bounds", () => {
    expect(clampPrice({ min: 1000, max: 5000 }, bounds)).toEqual({ min: 3000, max: 5000 });
  });
  it("treats the full range, an empty range or missing bounds as no filter", () => {
    expect(clampPrice({ min: 3000, max: 9000 }, bounds)).toBeNull();
    expect(clampPrice({ min: 10000, max: 20000 }, bounds)).toEqual({ min: 9000, max: 9000 });
    expect(clampPrice({ min: 1000, max: 2000 }, null)).toBeNull();
  });
});

describe("findCityByName", () => {
  it("resolves typed names in Ukrainian or English, ignoring case and apostrophes", () => {
    expect(findCityByName("Львів")?.id).toBe("lviv");
    expect(findCityByName("  lviv ")?.id).toBe("lviv");
    expect(findCityByName("Ternopilʼ")?.id).toBe("ternopil");
    expect(findCityByName("Львів, Україна")?.id).toBe("lviv");
    expect(findCityByName("Льв")).toBeUndefined();
  });
});

describe("validateSearch and searchKey", () => {
  it("accepts a typed city name and uses today as the boundary", () => {
    const values = { city: "lviv", checkIn: "2026-11-18", checkOut: "2026-11-20", adults: "2" };
    expect(validateSearch(values, "2026-11-18").query?.cityId).toBe("lviv");
    expect(validateSearch(values, "2026-11-19").errors.checkIn).toBe("Дата заїзду не може бути в минулому");
  });
  it("identifies a search without view params", () => {
    expect(searchKey({ cityId: "lviv", checkIn: "2026-12-09", checkOut: "2026-12-12", adults: 2 })).toBe("lviv|2026-12-09|2026-12-12|2");
  });
});
