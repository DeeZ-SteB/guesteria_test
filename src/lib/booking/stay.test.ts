import { describe, expect, it } from "vitest";
import { MAX_NIGHTS, nightsBetween, staySchema } from "./stay";

describe("nightsBetween", () => {
  it("counts nights between two dates", () => {
    expect(nightsBetween("2026-12-01", "2026-12-04")).toBe(3);
  });

  it("is not affected by a daylight-saving change inside the stay", () => {
    // Europe switches to winter time on 2026-10-25.
    expect(nightsBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("crosses month and year boundaries", () => {
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("staySchema", () => {
  const valid = { checkIn: "2026-12-01", checkOut: "2026-12-03", adults: "2" };

  it("accepts a valid stay and coerces adults from a query string", () => {
    expect(staySchema.parse(valid)).toEqual({ ...valid, adults: 2 });
  });

  it("rejects check-out on the same day as check-in", () => {
    const result = staySchema.safeParse({ ...valid, checkOut: valid.checkIn });
    expect(result.success).toBe(false);
  });

  it("rejects check-out before check-in", () => {
    expect(staySchema.safeParse({ ...valid, checkOut: "2026-11-30" }).success).toBe(false);
  });

  it(`rejects stays longer than ${MAX_NIGHTS} nights`, () => {
    expect(staySchema.safeParse({ ...valid, checkOut: "2027-01-15" }).success).toBe(false);
  });

  it("rejects malformed dates and zero guests", () => {
    expect(staySchema.safeParse({ ...valid, checkIn: "01.12.2026" }).success).toBe(false);
    expect(staySchema.safeParse({ ...valid, adults: "0" }).success).toBe(false);
  });
});
