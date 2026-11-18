import { describe, expect, it } from "vitest";
import { addRecent, parseRecent } from "@/lib/search/recent";
import { parsePending } from "./pending";
import { isAllowedImageUrl } from "@/lib/hotels/images";
import { favoriteInputSchema } from "@/features/favorites/schemas";

const q = (cityId: string, checkIn = "2026-12-09") => ({ cityId, checkIn, checkOut: "2026-12-12", adults: 2 });

describe("recent searches", () => {
  it("dedupes, puts the newest first and keeps five", () => {
    let list = ["lviv", "kyiv", "odesa", "paris", "rome", "prague"].reduce((acc, c) => addRecent(acc, q(c)), [] as ReturnType<typeof q>[]);
    expect(list.map((s) => s.cityId)).toEqual(["prague", "rome", "paris", "odesa", "kyiv"]);
    list = addRecent(list, q("paris"));
    expect(list.map((s) => s.cityId)).toEqual(["paris", "prague", "rome", "odesa", "kyiv"]);
  });

  it("drops corrupt JSON, unknown cities and past stays", () => {
    expect(parseRecent("{not json", "2026-11-18")).toEqual([]);
    expect(parseRecent(JSON.stringify([q("atlantis"), q("lviv", "2026-01-01"), q("kyiv"), "x"]), "2026-11-18")).toEqual([q("kyiv")]);
  });
});

describe("pending favorite", () => {
  const now = 1_800_000_000_000;
  it("accepts a fresh intent and rejects stale, future or malformed ones", () => {
    expect(parsePending(JSON.stringify({ hotelId: "lp1ab", at: now - 1000 }), now)).toEqual({ hotelId: "lp1ab", at: now - 1000 });
    expect(parsePending(JSON.stringify({ hotelId: "lp1ab", at: now - 11 * 60_000 }), now)).toBeNull();
    expect(parsePending(JSON.stringify({ hotelId: "lp1ab", at: now + 60_000 }), now)).toBeNull();
    expect(parsePending(JSON.stringify({ hotelId: "../x", at: now }), now)).toBeNull();
  });
});

describe("images and favorite input", () => {
  it("allows only https photos from the LiteAPI image host", () => {
    expect(isAllowedImageUrl("https://static.cupid.travel/hotels/1.jpg")).toBe(true);
    expect(isAllowedImageUrl("http://static.cupid.travel/hotels/1.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://static.cupid.travel.evil.com/1.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://user:pw@static.cupid.travel/1.jpg")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    // Found by the security-auditor agent: a port lets the optimizer probe other services.
    expect(isAllowedImageUrl("https://static.cupid.travel:8443/hotels/1.jpg")).toBe(false);
  });

  it("validates favorite input and drops foreign image URLs", () => {
    const base = { hotelId: "lpbbb0c", hotelName: "  Grand  ", cityId: "lviv", favorite: true };
    expect(favoriteInputSchema.parse({ ...base, hotelImage: "https://evil.com/x.jpg" })).toMatchObject({ hotelName: "Grand", hotelImage: null });
    // Zod must agree with the DB check, which accepts only the exact https://static.cupid.travel/ prefix.
    for (const tricky of [
      "https://static.cupid.travel@evil.com/x.jpg",
      "https:\\static.cupid.travel\\x.jpg",
      "HTTPS://STATIC.cupid.travel/x.jpg",
      "https://static.cupid.travel:443/x.jpg",
    ]) {
      expect(favoriteInputSchema.parse({ ...base, hotelImage: tricky }).hotelImage).toBeNull();
    }
    expect(favoriteInputSchema.safeParse({ ...base, hotelImage: null, hotelId: "a/b" }).success).toBe(false);
    expect(favoriteInputSchema.safeParse({ ...base, hotelImage: null, cityId: "atlantis" }).success).toBe(false);
  });
});

// ---- Regression found by the code-reviewer agent (stage 3): double-click rollback race ----
import { createRequestTracker } from "./tracker";

describe("createRequestTracker", () => {
  it("only lets the latest request for a hotel roll back, restoring the value before it", () => {
    const tracker = createRequestTracker();
    const first = tracker.begin("lp1", false); // was not saved → user saves
    const second = tracker.begin("lp1", true); // was saved (optimistically) → user unsaves
    expect(tracker.rollbackValue("lp1", first)).toBeUndefined(); // stale: ignore
    expect(tracker.rollbackValue("lp1", second)).toBe(true); // restore pre-click value
  });

  it("tracks hotels independently", () => {
    const tracker = createRequestTracker();
    const a = tracker.begin("a", false);
    tracker.begin("b", true);
    expect(tracker.rollbackValue("a", a)).toBe(false);
  });
});
