import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "00000000-0000-4000-8000-00000000000a";
const BID = "11111111-1111-4111-8111-111111111111";
const RID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  getOwnBooking: vi.fn(),
  upsertCheckin: vi.fn(),
  insertGuestRequest: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ verifiedUser: async () => mocks.auth }));
vi.mock("@/server/bookings", () => ({ getOwnBooking: mocks.getOwnBooking }));
vi.mock("@/server/trip", () => ({ upsertCheckin: mocks.upsertCheckin, insertGuestRequest: mocks.insertGuestRequest }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

import { createGuestRequest, saveCheckin } from "./actions";
import { todayInKyiv, addDays } from "@/lib/booking/stay";

const today = todayInKyiv();
const booking = (over: Record<string, unknown> = {}) => ({ id: BID, status: "confirmed", check_in: addDays(today, 5), check_out: addDays(today, 7), ...over });
const request = { id: RID, type: "transfer", details: "x", status: "sent", source: "guest", createdAt: "t", updatedAt: "t" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { status: "ok", user: { id: UID }, isDemo: false, emailConfirmed: true };
  mocks.getOwnBooking.mockResolvedValue(booking());
  mocks.upsertCheckin.mockResolvedValue({ ok: true, checkin: { arrivalTime: "14:30", notes: "", completedAt: "t" } });
  mocks.insertGuestRequest.mockResolvedValue({ ok: true, request });
});

describe("saveCheckin", () => {
  it("validates before anything else", async () => {
    const r = await saveCheckin({ bookingId: BID, arrivalTime: "10:15" });
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(mocks.getOwnBooking).not.toHaveBeenCalled();
  });
  it("needs a session; someone else's booking is not found and nothing is written", async () => {
    mocks.auth = { status: "session" };
    expect(await saveCheckin({ bookingId: BID, arrivalTime: "14:30" })).toEqual({ ok: false, reason: "session" });
    mocks.auth = { status: "ok", user: { id: UID } };
    mocks.getOwnBooking.mockResolvedValue(null);
    expect(await saveCheckin({ bookingId: BID, arrivalTime: "14:30" })).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.getOwnBooking).toHaveBeenCalledWith(UID, BID);
    expect(mocks.upsertCheckin).not.toHaveBeenCalled();
  });
  it("is closed for cancelled, pending and already-started stays", async () => {
    for (const b of [booking({ status: "cancelled" }), booking({ status: "pending" }), booking({ check_in: addDays(today, -1) })]) {
      mocks.getOwnBooking.mockResolvedValue(b);
      expect(await saveCheckin({ bookingId: BID, arrivalTime: "14:30" })).toEqual({ ok: false, reason: "closed" });
    }
    expect(mocks.upsertCheckin).not.toHaveBeenCalled();
  });
  it("saves on the arrival day; DB errors are retryable; never re-renders the page", async () => {
    mocks.getOwnBooking.mockResolvedValue(booking({ check_in: today }));
    expect(await saveCheckin({ bookingId: BID, arrivalTime: "14:30", notes: " Пізно " })).toMatchObject({ ok: true });
    expect(mocks.upsertCheckin).toHaveBeenCalledWith({ bookingId: BID, arrivalTime: "14:30", notes: "Пізно" });
    mocks.getOwnBooking.mockRejectedValue(new Error("db"));
    expect(await saveCheckin({ bookingId: BID, arrivalTime: "14:30" })).toEqual({ ok: false, reason: "retry" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("createGuestRequest", () => {
  const input = { requestId: RID, bookingId: BID, type: "transfer", details: "З вокзалу" };
  it("requires details where the hotel needs them", async () => {
    expect(await createGuestRequest({ ...input, details: "" })).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { details: expect.any(String) } });
  });
  it("is closed after the stay and for cancelled bookings", async () => {
    mocks.getOwnBooking.mockResolvedValue(booking({ check_in: addDays(today, -5), check_out: addDays(today, -1) }));
    expect(await createGuestRequest(input)).toEqual({ ok: false, reason: "closed" });
    mocks.getOwnBooking.mockResolvedValue(booking({ status: "cancelled" }));
    expect(await createGuestRequest(input)).toEqual({ ok: false, reason: "closed" });
    expect(mocks.insertGuestRequest).not.toHaveBeenCalled();
  });
  it("early check-in closes after arrival day, late check-out stays open", async () => {
    mocks.getOwnBooking.mockResolvedValue(booking({ check_in: addDays(today, -1), check_out: addDays(today, 1) }));
    expect(await createGuestRequest({ ...input, type: "early_check_in", details: "" })).toEqual({ ok: false, reason: "type_closed" });
    expect(await createGuestRequest({ ...input, type: "late_check_out", details: "" })).toMatchObject({ ok: true });
  });
  it("passes the DB outcome through (idempotent duplicate, open per type, limit)", async () => {
    expect(await createGuestRequest(input)).toEqual({ ok: true, request });
    expect(mocks.insertGuestRequest).toHaveBeenCalledWith(UID, { requestId: RID, bookingId: BID, type: "transfer", details: "З вокзалу" });
    mocks.insertGuestRequest.mockResolvedValue({ ok: false, reason: "duplicate_open" });
    expect(await createGuestRequest(input)).toEqual({ ok: false, reason: "duplicate_open" });
    mocks.insertGuestRequest.mockResolvedValue({ ok: false, reason: "limit" });
    expect(await createGuestRequest(input)).toEqual({ ok: false, reason: "limit" });
  });
  it("someone else's booking never reaches the database write", async () => {
    mocks.getOwnBooking.mockResolvedValue(null);
    expect(await createGuestRequest(input)).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.insertGuestRequest).not.toHaveBeenCalled();
  });
});
