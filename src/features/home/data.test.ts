import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/cache", () => next);
const api = vi.hoisted(() => ({ getCityHotelCards: vi.fn(), getReviews: vi.fn() }));
vi.mock("@/server/liteapi", () => api);
import { getHomeShowcase, HOME_CITY_IDS, mapLimited } from "./data";
import type { HotelCard } from "@/lib/home/showcase";

const card = (cityId: string, i = 0): HotelCard => ({
  id: `${cityId}${i}`, name: `H ${cityId}`, stars: 4, rating: 9, reviewCount: 500, photo: `https://static.cupid.travel/${cityId}${i}.jpg`, cityId,
});
const review = { id: "r", name: "Olena Kovalenko", score: 10, pros: "Чудовий готель, привітний персонал і смачний сніданок щоранку.", cons: null, language: "uk", country: null, date: null, headline: null };

beforeEach(() => {
  vi.clearAllMocks();
  api.getCityHotelCards.mockImplementation(async (id: string) => [card(id), card(id, 1)]);
  api.getReviews.mockImplementation(async (id: string) => [{ ...review, id: `r-${id}` }]);
});

describe("getHomeShowcase", () => {
  it("everything loaded: hours, hero from Lviv, all sections filled", async () => {
    const home = await getHomeShowcase();
    expect(next.cacheLife).toHaveBeenLastCalledWith("hours");
    expect(home.hero?.cityId).toBe("lviv");
    expect(home.cities.map((c) => c.cityId)).toEqual([...HOME_CITY_IDS]);
    expect(home.cities.every((c) => c.photo && c.hotelCount === 2)).toBe(true);
    expect(home.top).toHaveLength(8);
    expect(home.reviews[0].name).toBe("Olena K.");
  });

  it("one city failed: minutes, its tile falls back, the hero comes from the top list", async () => {
    api.getCityHotelCards.mockImplementation(async (id: string) => {
      if (id === "lviv") throw new Error("4290");
      return [card(id)];
    });
    const home = await getHomeShowcase();
    expect(next.cacheLife).toHaveBeenLastCalledWith("minutes");
    expect(home.cities[0]).toEqual({ cityId: "lviv", photo: null, hotelCount: 0 });
    expect(home.hero?.id).toBe(home.top[0].id);
  });

  it("reviews failed: minutes, page still has hotels", async () => {
    api.getReviews.mockRejectedValue(new Error("timeout"));
    const home = await getHomeShowcase();
    expect(next.cacheLife).toHaveBeenLastCalledWith("minutes");
    expect(home.reviews).toEqual([]);
    expect(home.top.length).toBeGreaterThan(0);
  });

  it("all cities failed: seconds and plain tiles", async () => {
    api.getCityHotelCards.mockRejectedValue(new Error("down"));
    const home = await getHomeShowcase();
    expect(next.cacheLife).toHaveBeenLastCalledWith("seconds");
    expect(home).toMatchObject({ hero: null, top: [], reviews: [] });
    expect(home.cities.every((c) => c.photo === null)).toBe(true);
  });
});

describe("mapLimited", () => {
  it("keeps order and never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimited([5, 1, 4, 2, 3], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
