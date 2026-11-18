import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks for everything the action talks to ----
const mocks = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a", email: "demo@x.ua", firstName: "Демо", lastName: "Гість", initials: "ДГ" } as unknown,
  bookPrebook: vi.fn(),
  findBookingsByReference: vi.fn(),
  findOwnByReference: vi.fn(),
  insertBooking: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("@/server/auth", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/server/liteapi", async () => {
  const { LiteApiError } = await import("@/server/liteapi/errors");
  return { bookPrebook: mocks.bookPrebook, findBookingsByReference: mocks.findBookingsByReference, LiteApiError };
});
vi.mock("@/server/bookings", () => ({ findOwnByReference: mocks.findOwnByReference, insertBooking: mocks.insertBooking }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, RedirectType: { replace: "replace" } }));

import { confirmBooking } from "./actions";
import { signCheckoutToken } from "@/server/checkout/token";
import { LiteApiError } from "@/server/liteapi/errors";

process.env.CHECKOUT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const UID = "00000000-0000-4000-8000-00000000000a";
const payload = {
  uid: UID, pid: "PRE1", hid: "lpbbb0c", ci: "2026-12-09", co: "2026-12-12", ad: 2, occ: 1,
  amt: 26648.98, cur: "UAH", room: "Double", board: "RO", city: "lviv", img: null, name: "Grand",
  rf: true, until: "2026-12-06T10:00:00.000Z",
};
const confirmed = { liteapiBookingId: "LB1", clientReference: "x", prebookId: "PRE1", hotelId: "lpbbb0c", checkIn: "2026-12-09", checkOut: "2026-12-12", confirmed: true, refundableUntil: null };

function form(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const entries = { token: signCheckoutToken(payload), firstName: "Олена", lastName: "Коваль", email: "o@x.ua", ...overrides };
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}
async function run(fd = form()) {
  try {
    return { state: await confirmBooking({}, fd) };
  } catch (e) {
    return { redirect: (e as { url?: string }).url };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: UID, email: "demo@x.ua", firstName: "Демо", lastName: "Гість", initials: "ДГ" };
  mocks.findOwnByReference.mockResolvedValue(null);
  mocks.insertBooking.mockResolvedValue("11111111-1111-4111-8111-111111111111");
});

describe("confirmBooking", () => {
  it("books once, saves the public price from the token and redirects to the success state", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    expect(await run()).toEqual({ redirect: "/checkout?booking=11111111-1111-4111-8111-111111111111" });
    expect(mocks.bookPrebook).toHaveBeenCalledTimes(1);
    expect(mocks.bookPrebook.mock.calls[0][0]).toMatchObject({ prebookId: "PRE1", clientReference: expect.stringMatching(/^gs-[0-9a-f]{24}$/) });
    expect(mocks.insertBooking.mock.calls[0][0]).toMatchObject({ userId: UID, totalAmount: 26648.98, hotelId: "lpbbb0c", liteapiBookingId: "LB1" });
  });

  it("stores the earlier of the checkout and booking cancellation deadlines", async () => {
    mocks.bookPrebook.mockResolvedValue({ ...confirmed, refundableUntil: "2026-12-09T23:59:59.000Z" });
    await run();
    expect(mocks.insertBooking.mock.calls[0][0].refundableUntil).toBe("2026-12-06T10:00:00.000Z");
  });

  it("ignores price/hotel fields smuggled into the form", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    await run(form({ amt: "1", price: "1", hotel: "lpevil", prebookId: "OTHER" }));
    expect(mocks.bookPrebook.mock.calls[0][0].prebookId).toBe("PRE1");
    expect(mocks.insertBooking.mock.calls[0][0].totalAmount).toBe(26648.98);
  });

  it("does not book again when this reference is already saved (double submit / back)", async () => {
    mocks.findOwnByReference.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    expect(await run()).toEqual({ redirect: "/checkout?booking=22222222-2222-4222-8222-222222222222" });
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("resolves LiteAPI's duplicate-reference error (4005) via lookup as success", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("duplicate", "POST /rates/book", { code: 4005 }));
    mocks.findBookingsByReference.mockResolvedValue([confirmed]);
    expect((await run()).redirect).toMatch(/^\/checkout\?booking=/);
    expect(mocks.bookPrebook).toHaveBeenCalledTimes(1);
  });

  it("treats a timeout as pending when the booking isn't found yet, and never retries book", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("timeout", "POST /rates/book"));
    mocks.findBookingsByReference.mockResolvedValue([]);
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.bookPrebook).toHaveBeenCalledTimes(1);
  });

  it("does not accept a lookup hit for a different prebook", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("timeout", "POST /rates/book"));
    mocks.findBookingsByReference.mockResolvedValue([{ ...confirmed, prebookId: "OTHER" }]);
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.insertBooking).not.toHaveBeenCalled();
  });

  it("reports a gone rate", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("no_availability", "POST /rates/book", { code: 2001 }));
    expect(await run()).toMatchObject({ state: { error: "rate_gone" } });
  });

  it("refuses a token issued to another user and an expired token", async () => {
    mocks.user = { id: "00000000-0000-4000-8000-00000000000b" };
    expect(await run()).toMatchObject({ state: { error: "invalid" } });
    mocks.user = { id: UID };
    expect(await run(form({ token: "garbage.token" }))).toMatchObject({ state: { error: "invalid" } });
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mocks.user = null;
    expect(await run()).toMatchObject({ state: { error: "session" } });
  });

  it("validates the guest before booking", async () => {
    expect(await run(form({ firstName: "", email: "nope" }))).toMatchObject({ state: { fieldErrors: { firstName: "Вкажіть ім'я", email: "Вкажіть коректний email" } } });
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("reports 'unsaved' (safe to retry) when the DB write fails after LiteAPI confirmed", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    mocks.insertBooking.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run()).toMatchObject({ state: { error: "unsaved" } });
  });

  it("rejects a LiteAPI booking that doesn't match the signed stay", async () => {
    mocks.bookPrebook.mockResolvedValue({ ...confirmed, checkOut: "2026-12-20" });
    expect(await run()).toMatchObject({ state: { error: "failed" } });
    expect(mocks.insertBooking).not.toHaveBeenCalled();
  });
});
