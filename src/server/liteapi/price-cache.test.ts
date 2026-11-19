import { beforeEach, describe, expect, it, vi } from "vitest";

// No real "use cache" in Vitest: every call runs the loader, so these tests pin the lifetimes chosen
// and the live retry of transient failures.
const next = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/cache", () => next);
vi.mock("@/server/env", () => ({ liteApiKey: () => "k", liteApiHosts: () => ({ data: "https://d.test", book: "https://b.test" }) }));
vi.mock("./client", () => ({ createLiteApiClient: () => ({ getHotels: async () => ({ data: [] }), getHotel: async () => ({}) }) }));
vi.mock("./mappers", async (orig) => ({ ...(await orig<typeof import("./mappers")>()), toHotelDetails: () => ({ rooms: [] }) }));
const service = vi.hoisted(() => ({ searchHotels: vi.fn(), getRoomRates: vi.fn() }));
vi.mock("./service", () => service);

import { EMPTY_RESULT, FAILED, ROOM_RATES, SEARCH_PRICES, forgetRoomRates, getRoomRates, searchHotels } from "./index";
import { LiteApiError } from "./errors";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const stay = { checkIn: inDays(20), checkOut: inDays(22), adults: 2 };
const hotel = { id: "lp1", name: "A" };

beforeEach(() => vi.clearAllMocks());

describe("price caches", () => {
  it("keeps prices for the price profile and empty results for a minute", async () => {
    service.searchHotels.mockResolvedValueOnce([hotel]);
    await expect(searchHotels({ cityId: "lviv", ...stay })).resolves.toEqual([hotel]);
    expect(next.cacheLife).toHaveBeenLastCalledWith(SEARCH_PRICES);

    service.searchHotels.mockResolvedValueOnce([]);
    await searchHotels({ cityId: "lviv", ...stay });
    expect(next.cacheLife).toHaveBeenLastCalledWith(EMPTY_RESULT);
  });

  it("does not serve a transient failure: it is retried live once", async () => {
    service.searchHotels.mockRejectedValueOnce(new LiteApiError("upstream", "rates", { code: 4290 })).mockResolvedValueOnce([hotel]);
    await expect(searchHotels({ cityId: "lviv", ...stay })).resolves.toEqual([hotel]);
    expect(service.searchHotels).toHaveBeenCalledTimes(2);
    expect(next.cacheLife).toHaveBeenCalledWith(FAILED);
  });

  it("does not retry 'nothing available' or a second failure", async () => {
    service.getRoomRates.mockRejectedValueOnce(new LiteApiError("no_availability", "rates"));
    await expect(getRoomRates("lp1", stay)).rejects.toMatchObject({ kind: "no_availability" });
    expect(service.getRoomRates).toHaveBeenCalledTimes(1);

    service.getRoomRates.mockRejectedValue(new LiteApiError("timeout", "rates"));
    await expect(getRoomRates("lp1", stay)).rejects.toMatchObject({ kind: "timeout" });
    expect(service.getRoomRates).toHaveBeenCalledTimes(3);
  });

  it("tags room rates per hotel and forgets them on demand", async () => {
    service.getRoomRates.mockResolvedValueOnce([{ offerId: "x" }]);
    await getRoomRates("lp1", stay);
    expect(next.cacheTag).toHaveBeenCalledWith("rates:lp1");
    expect(next.cacheLife).toHaveBeenLastCalledWith(ROOM_RATES);

    forgetRoomRates("lp1");
    expect(next.updateTag).toHaveBeenCalledWith("rates:lp1");
    expect(() => forgetRoomRates("../x")).toThrow(LiteApiError);
  });
});
