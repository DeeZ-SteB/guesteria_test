import { describe, expect, it } from "vitest";
import {
  ARRIVAL_SLOTS,
  applyRequestEvent,
  checkinEligibility,
  defaultArrival,
  isEarlierThan,
  mapsUrl,
  openTypes,
  requestTypeAvailable,
  tripMode,
  type GuestRequestView,
} from "./trip-page";
import { todayInKyiv } from "./stay";

const stay = { status: "confirmed" as const, checkIn: "2026-12-10", checkOut: "2026-12-12" };

describe("trip page logic", () => {
  it("has 48 half-hour slots", () => {
    expect(ARRIVAL_SLOTS).toHaveLength(48);
    expect(ARRIVAL_SLOTS[0]).toBe("00:00");
    expect(ARRIVAL_SLOTS[47]).toBe("23:30");
  });

  it("rounds the hotel check-in time up to a slot", () => {
    expect(defaultArrival("14:10")).toBe("14:30");
    expect(defaultArrival("14:00")).toBe("14:00");
    expect(defaultArrival("23:50")).toBe("23:30");
    expect(defaultArrival(null)).toBe("15:00");
    expect(defaultArrival("noon")).toBe("15:00");
    expect(isEarlierThan("10:00", "14:00")).toBe(true);
    expect(isEarlierThan("15:00", "14:00")).toBe(false);
    expect(isEarlierThan("10:00", null)).toBe(false);
  });

  it("decides the mode by Kyiv date", () => {
    const today = todayInKyiv(new Date("2026-12-11T22:30:00Z")); // already the 12th in Kyiv
    expect(today).toBe("2026-12-12");
    expect(tripMode(stay, today)).toBe("active"); // check-out day
    expect(tripMode(stay, "2026-12-13")).toBe("past");
    expect(tripMode({ ...stay, status: "cancelled" }, today)).toBe("cancelled");
    expect(tripMode({ ...stay, status: "pending" }, today)).toBe("pending");
  });

  it("check-in closes after the arrival day; early check-in too", () => {
    expect(checkinEligibility(stay, "2026-12-10")).toEqual({ ok: true });
    expect(checkinEligibility(stay, "2026-12-11")).toEqual({ ok: false, reason: "too_late" });
    expect(checkinEligibility({ ...stay, status: "cancelled" }, "2026-12-01")).toEqual({ ok: false, reason: "not_confirmed" });
    expect(requestTypeAvailable("early_check_in", stay, "2026-12-11")).toBe(false);
    expect(requestTypeAvailable("late_check_out", stay, "2026-12-12")).toBe(true);
    expect(requestTypeAvailable("late_check_out", stay, "2026-12-13")).toBe(false);
  });

  it("builds a safe maps link", () => {
    expect(mapsUrl({ lat: 49.84, lng: 24.03 }, "x")).toBe("https://www.google.com/maps/dir/?api=1&destination=49.84,24.03");
    expect(mapsUrl({ lat: Number.NaN, lng: 1 }, "Готель & Spa, Львів")).toBe(
      "https://www.google.com/maps/search/?api=1&query=%D0%93%D0%BE%D1%82%D0%B5%D0%BB%D1%8C%20%26%20Spa%2C%20%D0%9B%D1%8C%D0%B2%D1%96%D0%B2",
    );
    expect(mapsUrl({ lat: 95, lng: 1 }, "a")).toContain("/search/");
    expect(mapsUrl({ lat: 0, lng: 0 }, "a")).toContain("/search/");
    expect(mapsUrl(null, "a")).toContain("/search/");
  });

  it("merges request events: insert, update, stale, sort", () => {
    const r = (id: string, created: string, updated: string, status: GuestRequestView["status"] = "sent"): GuestRequestView => ({
      id,
      type: "transfer",
      details: null,
      status,
      source: "guest",
      createdAt: created,
      updatedAt: updated,
    });
    let list = applyRequestEvent([], r("a", "2026-12-01T10:00:00Z", "2026-12-01T10:00:00Z"));
    list = applyRequestEvent(list, r("b", "2026-12-01T11:00:00Z", "2026-12-01T11:00:00Z"));
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
    list = applyRequestEvent(list, r("a", "2026-12-01T10:00:00Z", "2026-12-01T12:00:00Z", "confirmed"));
    expect(list.find((x) => x.id === "a")?.status).toBe("confirmed");
    // A late INSERT echo must not undo the newer status.
    list = applyRequestEvent(list, r("a", "2026-12-01T10:00:00Z", "2026-12-01T10:00:00Z"));
    expect(list.find((x) => x.id === "a")?.status).toBe("confirmed");
    expect(list).toHaveLength(2);
    expect([...openTypes(list)]).toEqual(["transfer"]);
  });
});
