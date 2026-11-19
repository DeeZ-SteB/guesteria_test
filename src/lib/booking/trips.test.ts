import { describe, expect, it } from "vitest";
import { CANCEL_MARGIN_MS, cancelEligibility, groupTrips, nearestTripId, tripBadge, tripBadgeText, type TripRow } from "./trips";
import { todayInKyiv } from "./stay";

const row = (over: Partial<TripRow>): TripRow => ({
  id: "t",
  status: "confirmed",
  hotelId: "lp1",
  hotelName: "Hotel",
  hotelImage: null,
  city: null,
  checkIn: "2026-12-20",
  checkOut: "2026-12-22",
  adults: 2,
  roomName: "Room",
  totalAmount: 1000,
  currency: "UAH",
  refundable: true,
  refundableUntil: "2026-12-18T10:00:00.000Z",
  hasLiteApiId: true,
  cancellable: true,
  ...over,
});

describe("groupTrips", () => {
  it("uses the Kyiv date: 22:30 UTC on the 8th is already the 9th", () => {
    const today = todayInKyiv(new Date("2026-12-08T22:30:00Z"));
    expect(today).toBe("2026-12-09");
    const g = groupTrips([row({ id: "a", checkIn: "2026-12-07", checkOut: "2026-12-09" }), row({ id: "b", checkIn: "2026-12-06", checkOut: "2026-12-08" })], today);
    expect(g.upcoming.map((t) => t.id)).toEqual(["a"]); // check-out day still counts
    expect(g.past.map((t) => t.id)).toEqual(["b"]);
  });

  it("puts pending first, then by check-in; past newest first; cancelled separately", () => {
    const g = groupTrips(
      [
        row({ id: "late", checkIn: "2027-01-10", checkOut: "2027-01-12" }),
        row({ id: "soon", checkIn: "2026-12-20", checkOut: "2026-12-22" }),
        row({ id: "pend", status: "pending", checkIn: "2027-02-01", checkOut: "2027-02-02" }),
        row({ id: "old1", checkIn: "2026-10-01", checkOut: "2026-10-03" }),
        row({ id: "old2", checkIn: "2026-11-01", checkOut: "2026-11-03" }),
        row({ id: "oldpend", status: "pending", checkIn: "2026-09-01", checkOut: "2026-09-02" }),
        row({ id: "x", status: "cancelled", checkIn: "2027-03-01", checkOut: "2027-03-02" }),
      ],
      "2026-12-01",
    );
    expect(g.upcoming.map((t) => t.id)).toEqual(["pend", "soon", "late"]);
    expect(g.past.map((t) => t.id)).toEqual(["old2", "old1", "oldpend"]);
    expect(g.cancelled.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("tripBadge", () => {
  const today = "2026-12-10";
  it("counts down only for the nearest confirmed trip", () => {
    const a = row({ id: "a", checkIn: "2026-12-11", checkOut: "2026-12-12" });
    const b = row({ id: "b", checkIn: "2026-12-20", checkOut: "2026-12-21" });
    const nearest = nearestTripId([a, b], today);
    expect(tripBadge(a, today, nearest)).toEqual({ kind: "in_days", days: 1 });
    expect(tripBadge(b, today, nearest)).toBeNull();
  });
  it("labels badges in Ukrainian with plural forms", () => {
    expect(tripBadgeText({ kind: "in_days", days: 1 })).toBe("Завтра");
    expect(tripBadgeText({ kind: "in_days", days: 3 })).toBe("Через 3 дні");
    expect(tripBadgeText({ kind: "in_days", days: 27 })).toBe("Через 27 днів");
    expect(tripBadgeText({ kind: "today" })).toBe("Заїзд сьогодні");
  });
  it("marks today, ongoing and processing", () => {
    expect(tripBadge(row({ checkIn: today, checkOut: "2026-12-12" }), today, null)).toEqual({ kind: "today" });
    expect(tripBadge(row({ checkIn: "2026-12-08", checkOut: "2026-12-12" }), today, null)).toEqual({ kind: "ongoing" });
    expect(tripBadge(row({ status: "pending" }), today, null)).toEqual({ kind: "processing" });
    expect(tripBadge(row({ status: "cancelled" }), today, null)).toBeNull();
  });
});

describe("cancelEligibility", () => {
  const now = new Date("2026-12-10T12:00:00Z");
  it("allows a refundable confirmed booking before the deadline", () => {
    expect(cancelEligibility(row({}), now)).toEqual({ ok: true });
  });
  it("refuses within the safety margin and after the deadline", () => {
    const until = new Date(now.getTime() + CANCEL_MARGIN_MS - 1000).toISOString();
    expect(cancelEligibility(row({ refundableUntil: until }), now)).toEqual({ ok: false, reason: "deadline_passed" });
    expect(cancelEligibility(row({ refundableUntil: "2026-12-09T00:00:00Z" }), now)).toEqual({ ok: false, reason: "deadline_passed" });
    expect(cancelEligibility(row({ refundableUntil: "garbage" }), now)).toEqual({ ok: false, reason: "deadline_passed" });
  });
  it("refundable without a deadline: until the day before check-in (Kyiv)", () => {
    expect(cancelEligibility(row({ refundableUntil: null, checkIn: "2026-12-11" }), now)).toEqual({ ok: true });
    expect(cancelEligibility(row({ refundableUntil: null, checkIn: "2026-12-10" }), now)).toEqual({ ok: false, reason: "stay_started" });
    // 22:30 UTC on the 10th is the 11th in Kyiv: check-in day.
    expect(cancelEligibility(row({ refundableUntil: null, checkIn: "2026-12-11" }), new Date("2026-12-10T22:30:00Z"))).toEqual({
      ok: false,
      reason: "stay_started",
    });
  });
  it("refuses non-refundable, pending, cancelled and unbooked rows", () => {
    expect(cancelEligibility(row({ refundable: false }), now)).toEqual({ ok: false, reason: "non_refundable" });
    expect(cancelEligibility(row({ status: "pending" }), now)).toEqual({ ok: false, reason: "not_confirmed" });
    expect(cancelEligibility(row({ status: "cancelled" }), now)).toEqual({ ok: false, reason: "not_confirmed" });
    expect(cancelEligibility(row({ hasLiteApiId: false }), now)).toEqual({ ok: false, reason: "no_liteapi_id" });
  });
});
