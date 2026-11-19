import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks for everything the action talks to ----
const UID = "00000000-0000-4000-8000-00000000000a";
const mocks = vi.hoisted(() => ({
  auth: { status: "ok", user: { id: "00000000-0000-4000-8000-00000000000a" } } as { status: string; user?: { id: string } },
  bookPrebook: vi.fn(),
  findBookingsByReference: vi.fn(),
  findOwnAttempt: vi.fn(),
  claimAttempt: vi.fn(),
  confirmAttempt: vi.fn(),
  notePendingLiteApiId: vi.fn(),
  releaseAttempt: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("@/server/auth", () => ({ verifiedBookingUser: async () => mocks.auth }));
vi.mock("@/server/liteapi", async () => {
  const { LiteApiError } = await import("@/server/liteapi/errors");
  return { bookPrebook: mocks.bookPrebook, findBookingsByReference: mocks.findBookingsByReference, LiteApiError };
});
vi.mock("@/server/bookings", () => ({
  findOwnAttempt: mocks.findOwnAttempt,
  claimAttempt: mocks.claimAttempt,
  confirmAttempt: mocks.confirmAttempt,
  notePendingLiteApiId: mocks.notePendingLiteApiId,
  releaseAttempt: mocks.releaseAttempt,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, RedirectType: { replace: "replace" } }));

import { confirmBooking } from "./actions";
import { signCheckoutToken, TOKEN_TTL_MS } from "@/server/checkout/token";
import { LiteApiError } from "@/server/liteapi/errors";

process.env.CHECKOUT_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const payload = {
  uid: UID, pid: "PRE1", hid: "lpbbb0c", ci: "2026-12-09", co: "2026-12-12", ad: 2, occ: 1,
  amt: 26648.98, cur: "UAH", room: "Double", board: "RO", city: "lviv", img: null, name: "Grand",
  rf: true, until: "2026-12-06T10:00:00.000Z",
};
const ATTEMPT = { id: "11111111-1111-4111-8111-111111111111", status: "pending", createdAt: new Date().toISOString(), liteapiBookingId: null };
const confirmed = {
  liteapiBookingId: "LB1", clientReference: null, prebookId: "PRE1", hotelId: "lpbbb0c", checkIn: "2026-12-09", checkOut: "2026-12-12",
  status: "CONFIRMED", confirmed: true, refundable: true, refundableUntil: "2026-12-09T23:59:59.000Z",
};

function form(overrides: Record<string, string> = {}, token = signCheckoutToken(payload)!) {
  const fd = new FormData();
  const entries = { token, firstName: "Олена", lastName: "Коваль", email: "o@x.ua", ...overrides };
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
const SUCCESS = { redirect: `/checkout?booking=${ATTEMPT.id}` };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { status: "ok", user: { id: UID } };
  mocks.findOwnAttempt.mockResolvedValue(null);
  mocks.claimAttempt.mockResolvedValue({ claimed: true, attempt: ATTEMPT });
  mocks.confirmAttempt.mockResolvedValue(undefined);
  mocks.findBookingsByReference.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("confirmBooking — happy path", () => {
  it("records the attempt first, books once, stores the public price and the earliest deadline", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    expect(await run()).toEqual(SUCCESS);
    expect(mocks.claimAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.bookPrebook.mock.invocationCallOrder[0]);
    expect(mocks.bookPrebook).toHaveBeenCalledTimes(1);
    expect(mocks.claimAttempt.mock.calls[0][0]).toMatchObject({ userId: UID, totalAmount: 26648.98, hotelId: "lpbbb0c", refundable: true, refundableUntil: "2026-12-06T10:00:00.000Z", clientReference: expect.stringMatching(/^gs-[0-9a-f]{24}$/) });
    expect(mocks.confirmAttempt.mock.calls[0][1]).toEqual({ liteapiBookingId: "LB1", refundable: true, refundableUntil: "2026-12-06T10:00:00.000Z" });
  });

  it("ignores price/hotel fields smuggled into the form", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    await run(form({ amt: "1", price: "1", hotel: "lpevil", prebookId: "OTHER" }));
    expect(mocks.bookPrebook.mock.calls[0][0].prebookId).toBe("PRE1");
    expect(mocks.claimAttempt.mock.calls[0][0].totalAmount).toBe(26648.98);
  });

  it("stores a booking LiteAPI reports as non-refundable as non-refundable", async () => {
    mocks.bookPrebook.mockResolvedValue({ ...confirmed, refundable: false, refundableUntil: null });
    await run();
    expect(mocks.confirmAttempt.mock.calls[0][1]).toMatchObject({ refundable: false, refundableUntil: null });
  });
});

describe("confirmBooking — never two bookings", () => {
  it("a concurrent submit that loses the claim does not call book", async () => {
    mocks.claimAttempt.mockResolvedValue({ claimed: false, attempt: ATTEMPT });
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("a confirmed attempt redirects without booking (double submit / Back)", async () => {
    mocks.findOwnAttempt.mockResolvedValue({ ...ATTEMPT, status: "confirmed" });
    expect(await run()).toEqual(SUCCESS);
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("a pending attempt is resolved by lookup, never by booking again", async () => {
    mocks.findOwnAttempt.mockResolvedValue(ATTEMPT);
    mocks.findBookingsByReference.mockResolvedValue([confirmed]);
    expect(await run()).toEqual(SUCCESS);
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("an EXPIRED token still resolves an existing attempt (no reload → no second prebook)", async () => {
    const old = signCheckoutToken(payload, Date.now() - TOKEN_TTL_MS - 60_000)!;
    mocks.findOwnAttempt.mockResolvedValue(ATTEMPT);
    mocks.findBookingsByReference.mockResolvedValue([confirmed]);
    expect(await run(form({}, old))).toEqual(SUCCESS);
    expect(mocks.bookPrebook).not.toHaveBeenCalled();
  });

  it("an expired token can never START a booking", async () => {
    const old = signCheckoutToken(payload, Date.now() - TOKEN_TTL_MS - 60_000)!;
    expect(await run(form({}, old))).toMatchObject({ state: { error: "expired" } });
    expect(mocks.claimAttempt).not.toHaveBeenCalled();
  });

  it("returns the attempt's token so a retry reuses it", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("timeout", "POST /rates/book"));
    const fd = form();
    const result = await run(fd);
    expect(result.state?.token).toBe(fd.get("token"));
  });
});

describe("confirmBooking — uncertain outcomes stay pending", () => {
  it("4005 resolved by lookup is a success", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("duplicate", "POST /rates/book", { code: 4005 }));
    mocks.findBookingsByReference.mockResolvedValue([confirmed]);
    expect(await run()).toEqual(SUCCESS);
  });

  it("4005 with an empty lookup is pending (a booking exists), not 'pick another rate'", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("duplicate", "POST /rates/book", { code: 4005 }));
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.releaseAttempt).not.toHaveBeenCalled();
  });

  it("a failing lookup is 'unknown', never 'not found'", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("no_availability", "POST /rates/book", { code: 2001 }));
    mocks.findBookingsByReference.mockRejectedValue(new LiteApiError("timeout", "GET /bookings"));
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.releaseAttempt).not.toHaveBeenCalled();
  });

  it("timeout + nothing found yet → pending, and book is never retried", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("timeout", "POST /rates/book"));
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.bookPrebook).toHaveBeenCalledTimes(1);
  });

  it("a booked-but-not-CONFIRMED status is pending and remembers LiteAPI's id", async () => {
    mocks.bookPrebook.mockResolvedValue({ ...confirmed, status: "PENDING", confirmed: false });
    expect(await run()).toMatchObject({ state: { error: "pending" } });
    expect(mocks.notePendingLiteApiId).toHaveBeenCalledWith(ATTEMPT.id, "LB1");
  });

  it("a booking that doesn't match the signed stay goes to support, not 'try again'", async () => {
    mocks.bookPrebook.mockResolvedValue({ ...confirmed, checkOut: "2026-12-20" });
    expect(await run()).toMatchObject({ state: { error: "support" } });
    expect(mocks.confirmAttempt).not.toHaveBeenCalled();
  });

  it("'unsaved' when the DB confirm fails after LiteAPI confirmed (retry resolves it)", async () => {
    mocks.bookPrebook.mockResolvedValue(confirmed);
    mocks.confirmAttempt.mockRejectedValue(new Error("db down"));
    expect(await run()).toMatchObject({ state: { error: "unsaved" } });
  });
});

describe("confirmBooking — definite failures free the attempt", () => {
  it("2001 after a lookup that finds nothing → rate gone, attempt released", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("no_availability", "POST /rates/book", { code: 2001 }));
    expect(await run()).toMatchObject({ state: { error: "rate_gone" } });
    expect(mocks.findBookingsByReference).toHaveBeenCalled();
    expect(mocks.releaseAttempt).toHaveBeenCalledWith(ATTEMPT.id);
  });

  it("2001 but the lookup finds the earlier booking → success, not 'rate gone'", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("no_availability", "POST /rates/book", { code: 2001 }));
    mocks.findBookingsByReference.mockResolvedValue([confirmed]);
    expect(await run()).toEqual(SUCCESS);
  });

  it("4000 (guest data rejected) has its own message", async () => {
    mocks.bookPrebook.mockRejectedValue(new LiteApiError("invalid_request", "POST /rates/book", { code: 4000 }));
    expect(await run()).toMatchObject({ state: { error: "guest_rejected" } });
  });

  it("an old pending attempt with nothing at LiteAPI is released after the book window", async () => {
    mocks.findOwnAttempt.mockResolvedValue({ ...ATTEMPT, createdAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    expect(await run()).toMatchObject({ state: { error: "expired" } });
    expect(mocks.releaseAttempt).toHaveBeenCalled();
  });
});

describe("confirmBooking — guards", () => {
  it("refuses a token issued to another user and a forged token", async () => {
    mocks.auth = { status: "ok", user: { id: "00000000-0000-4000-8000-00000000000b" } };
    expect(await run()).toMatchObject({ state: { error: "invalid" } });
    mocks.auth = { status: "ok", user: { id: UID } };
    expect(await run(form({ token: "garbage.token" }))).toMatchObject({ state: { error: "invalid" } });
    expect(mocks.claimAttempt).not.toHaveBeenCalled();
  });

  it("requires a live session and a confirmed email", async () => {
    mocks.auth = { status: "session" };
    expect(await run()).toMatchObject({ state: { error: "session" } });
    mocks.auth = { status: "unverified" };
    expect(await run()).toMatchObject({ state: { error: "unverified" } });
    expect(mocks.claimAttempt).not.toHaveBeenCalled();
  });

  it("validates the guest before recording anything", async () => {
    expect(await run(form({ firstName: "", email: "nope" }))).toMatchObject({
      state: { fieldErrors: { firstName: "Вкажіть ім'я", email: "Вкажіть коректний email" } },
    });
    expect(mocks.claimAttempt).not.toHaveBeenCalled();
  });
});
