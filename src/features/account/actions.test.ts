import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "00000000-0000-4000-8000-00000000000a";
const BID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  limit: { allowed: true } as { allowed: boolean; retryAfter?: number },
  auth: {} as Record<string, unknown>,
  getOwnBooking: vi.fn(),
  markCancelled: vi.fn(),
  hasActiveTrips: vi.fn(),
  cancelBookingAtLiteApi: vi.fn(),
  getLiteApiBookingStatus: vi.fn(),
  deleteUserAccount: vi.fn(),
  refresh: vi.fn(),
  supabase: {
    rpc: vi.fn(),
    auth: {
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("@/server/auth", () => ({ verifiedUser: async () => mocks.auth }));
vi.mock("@/server/bookings", () => ({ getOwnBooking: mocks.getOwnBooking, markCancelled: mocks.markCancelled, hasActiveTrips: mocks.hasActiveTrips }));
vi.mock("@/server/liteapi", () => ({ cancelBookingAtLiteApi: mocks.cancelBookingAtLiteApi, getLiteApiBookingStatus: mocks.getLiteApiBookingStatus }));
vi.mock("@/server/users", () => ({ deleteUserAccount: mocks.deleteUserAccount }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks.supabase }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/server/rate-limit", () => ({ hit: async () => mocks.limit, hitAll: async () => mocks.limit }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, RedirectType: { replace: "replace" } }));

import { cancelTrip, changePassword, deleteAccount, updateProfile } from "./actions";

const user = { id: UID, email: "o@x.ua", firstName: "О", lastName: "", initials: "О" };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const booking = (over: Record<string, unknown> = {}) => ({
  id: BID,
  status: "confirmed",
  liteapi_booking_id: "LB1",
  check_in: future(10).slice(0, 10),
  check_out: future(12).slice(0, 10),
  refundable: true,
  refundable_until: future(5),
  ...over,
});
const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { status: "ok", user, isDemo: false, emailConfirmed: true };
  mocks.getOwnBooking.mockResolvedValue(booking());
  mocks.markCancelled.mockResolvedValue("updated");
  mocks.cancelBookingAtLiteApi.mockResolvedValue({ status: "cancelled", charged: false });
  mocks.hasActiveTrips.mockResolvedValue(null);
  mocks.limit = { allowed: true };
  mocks.supabase.rpc.mockImplementation(async (fn: string) => ({ data: fn === "recent_password_failures" ? 0 : null, error: null }));
  mocks.supabase.auth.updateUser.mockResolvedValue({ error: null });
  mocks.supabase.auth.refreshSession.mockResolvedValue({ error: null });
  mocks.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: UID } }, error: null });
  mocks.supabase.auth.signOut.mockResolvedValue({ error: null });
});

describe("cancelTrip", () => {
  it("rejects a malformed id and a missing session before touching data", async () => {
    expect(await cancelTrip({ bookingId: "x" })).toEqual({ ok: false, reason: "invalid" });
    mocks.auth = { status: "session" };
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "session" });
    expect(mocks.getOwnBooking).not.toHaveBeenCalled();
  });

  it("is rate limited per user before LiteAPI is called", async () => {
    mocks.limit = { allowed: false, retryAfter: 60 };
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "rate_limited" });
    expect(mocks.cancelBookingAtLiteApi).not.toHaveBeenCalled();
  });

  it("someone else's booking is not found and never reaches LiteAPI", async () => {
    mocks.getOwnBooking.mockResolvedValue(null);
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.getOwnBooking).toHaveBeenCalledWith(UID, BID);
    expect(mocks.cancelBookingAtLiteApi).not.toHaveBeenCalled();
  });

  it("a database error is retryable, not 'not found'", async () => {
    mocks.getOwnBooking.mockRejectedValue(new Error("db"));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "retry" });
    expect(mocks.cancelBookingAtLiteApi).not.toHaveBeenCalled();
  });

  it("an already cancelled booking is a no-op (double click, second tab)", async () => {
    mocks.getOwnBooking.mockResolvedValue(booking({ status: "cancelled" }));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: true, state: "already_cancelled" });
    expect(mocks.cancelBookingAtLiteApi).not.toHaveBeenCalled();
  });

  it("refuses ineligible bookings server-side whatever the UI showed", async () => {
    mocks.getOwnBooking.mockResolvedValue(booking({ refundable: false }));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "non_refundable" });
    mocks.getOwnBooking.mockResolvedValue(booking({ refundable_until: future(-1) }));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "deadline_passed" });
    mocks.getOwnBooking.mockResolvedValue(booking({ status: "pending", liteapi_booking_id: null }));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "not_confirmed" });
    expect(mocks.cancelBookingAtLiteApi).not.toHaveBeenCalled();
  });

  it("cancels once at LiteAPI, then marks the row", async () => {
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: true, state: "cancelled" });
    expect(mocks.cancelBookingAtLiteApi).toHaveBeenCalledTimes(1);
    expect(mocks.cancelBookingAtLiteApi).toHaveBeenCalledWith("LB1");
    expect(mocks.markCancelled).toHaveBeenCalledWith(UID, BID);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("with charges marks cancelled but tells the guest (never 'full refund')", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.cancelBookingAtLiteApi.mockResolvedValue({ status: "cancelled_with_charges", charged: true });
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: true, state: "cancelled_with_charges" });
    expect(mocks.markCancelled).toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("a timed-out cancel that went through is reconciled by reading the booking", async () => {
    mocks.cancelBookingAtLiteApi.mockRejectedValue(new Error("timeout"));
    mocks.getLiteApiBookingStatus.mockResolvedValue("cancelled");
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: true, state: "cancelled" });
    expect(mocks.markCancelled).toHaveBeenCalled();
  });

  it("a failed cancel with the booking still confirmed writes nothing", async () => {
    mocks.cancelBookingAtLiteApi.mockRejectedValue(new Error("upstream"));
    mocks.getLiteApiBookingStatus.mockResolvedValue("confirmed");
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "liteapi_failed" });
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });

  it("unknown outcome when the read-back fails too", async () => {
    mocks.cancelBookingAtLiteApi.mockRejectedValue(new Error("network"));
    mocks.getLiteApiBookingStatus.mockRejectedValue(new Error("network"));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "unknown_outcome" });
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });

  it("cancelled at LiteAPI but the DB write fails → save_failed (retry self-heals)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.markCancelled.mockRejectedValue(new Error("db"));
    expect(await cancelTrip({ bookingId: BID })).toEqual({ ok: false, reason: "save_failed" });
    log.mockRestore();
  });
});

describe("demo account guard", () => {
  beforeEach(() => {
    mocks.auth = { status: "ok", user, isDemo: true, emailConfirmed: true };
  });
  it("blocks profile, password and deletion server-side", async () => {
    expect((await updateProfile({}, fd({ firstName: "X", aiLanguage: "uk" }))).error).toMatch(/демо/);
    expect((await changePassword({}, fd({ currentPassword: "old-pass1", newPassword: "new-pass1", confirm: "new-pass1" }))).error).toMatch(/демо/);
    expect((await deleteAccount({}, fd({ currentPassword: "x", confirm: "ВИДАЛИТИ" }))).error).toMatch(/демо/);
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(mocks.deleteUserAccount).not.toHaveBeenCalled();
  });
});

describe("updateProfile", () => {
  it("saves metadata and refreshes the session so the header updates now", async () => {
    const state = await updateProfile({}, fd({ firstName: "Олена", lastName: "Коваль", phone: "+38 067 123 45 67", aiLanguage: "en" }));
    expect(state.notice).toBe("Збережено");
    expect(mocks.supabase.auth.updateUser).toHaveBeenCalledWith({
      data: { first_name: "Олена", last_name: "Коваль", phone: "+380671234567", ai_language: "en" },
    });
    expect(mocks.supabase.auth.refreshSession).toHaveBeenCalled();
  });
  it("returns field errors without calling Supabase", async () => {
    const state = await updateProfile({}, fd({ firstName: "", aiLanguage: "uk" }));
    expect(state.fieldErrors?.firstName).toBeTruthy();
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  const input = { currentPassword: "old-pass1", newPassword: "new-pass1", confirm: "new-pass1" };
  it("refuses a wrong current password and counts the failure", async () => {
    mocks.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials" } });
    expect((await changePassword({}, fd(input))).fieldErrors?.currentPassword).toBe("Невірний поточний пароль");
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("record_password_failure");
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled();
  });
  it("stops checking passwords after 5 failures in 15 minutes", async () => {
    mocks.supabase.rpc.mockImplementation(async (fn: string) => ({ data: fn === "recent_password_failures" ? 5 : null, error: null }));
    expect((await changePassword({}, fd(input))).error).toMatch(/Забагато спроб/);
    expect((await deleteAccount({}, fd({ currentPassword: "x", confirm: "ВИДАЛИТИ" }))).error).toMatch(/Забагато спроб/);
    expect(mocks.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("fails closed when the attempt counter is unavailable", async () => {
    mocks.supabase.rpc.mockResolvedValue({ data: null, error: { code: "x" } });
    expect((await changePassword({}, fd(input))).error).toBeTruthy();
    expect(mocks.supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("changes the password and signs out other sessions", async () => {
    expect((await changePassword({}, fd(input))).notice).toMatch(/Пароль змінено/);
    expect(mocks.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: "o@x.ua", password: "old-pass1" });
    expect(mocks.supabase.auth.updateUser).toHaveBeenCalledWith({ password: "new-pass1" });
    expect(mocks.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });
});

describe("deleteAccount", () => {
  const input = { currentPassword: "pass-1234", confirm: "ВИДАЛИТИ" };
  it("is blocked while there are active trips", async () => {
    mocks.hasActiveTrips.mockResolvedValue("confirmed");
    expect((await deleteAccount({}, fd(input))).error).toMatch(/майбутні поїздки/);
    expect(mocks.deleteUserAccount).not.toHaveBeenCalled();
  });
  it("an unresolved attempt points to its status page instead of a dead end", async () => {
    mocks.hasActiveTrips.mockResolvedValue("pending");
    expect((await deleteAccount({}, fd(input))).error).toMatch(/обробляється/);
    expect(mocks.deleteUserAccount).not.toHaveBeenCalled();
  });
  it("needs the right password", async () => {
    mocks.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials" } });
    expect((await deleteAccount({}, fd(input))).fieldErrors?.currentPassword).toBeTruthy();
    expect(mocks.deleteUserAccount).not.toHaveBeenCalled();
  });
  it("deletes, signs out and goes home", async () => {
    await expect(deleteAccount({}, fd(input))).rejects.toMatchObject({ url: "/" });
    expect(mocks.deleteUserAccount).toHaveBeenCalledWith(UID);
    expect(mocks.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
