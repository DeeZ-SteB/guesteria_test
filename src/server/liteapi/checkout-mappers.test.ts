import { describe, expect, it } from "vitest";
import { bookingSchema, cancelBookingSchema, prebookSchema } from "./schemas";
import { toBookingState, toCancelOutcome, toCheckoutQuote, toConfirmedBooking } from "./mappers";
import { checkoutErrorMessage, guestSchema, priceChange } from "@/lib/booking/checkout";
import { payAtHotelText } from "@/lib/hotels/rates";
import prebook from "./__fixtures__/prebook.json";
import book from "./__fixtures__/book.json";
import booking from "./__fixtures__/booking.json";
import cancel from "./__fixtures__/cancel.json";

const NOW = new Date("2026-11-18T12:00:00Z");
const plain = (s: string | null) => s?.replace(/[  ]/g, " ");

describe("toCheckoutQuote (sandbox prebook)", () => {
  const quote = toCheckoutQuote(prebookSchema.parse(prebook.body), NOW);

  it("shows the public price, not our net cost", () => {
    expect(quote.price).toEqual({ amount: 26648.98, currency: "UAH" });
  });

  it("takes stay, room, board and cancellation from prebook", () => {
    expect(quote).toMatchObject({
      prebookId: prebook.body.data.prebookId,
      hotelId: "lpbbb0c",
      checkIn: "2026-12-09",
      checkOut: "2026-12-12",
      adults: 2,
      occupancyNumber: 1,
      roomName: "Double/Twin (2 People)",
      boardCode: "RO",
      refundable: true,
      freeCancellationUntil: "2026-12-06T10:00:00.000Z",
      changes: { price: false, cancellation: false, board: false },
    });
  });

  it("lists the tourism fee payable at the hotel (VAT is included)", () => {
    expect(plain(payAtHotelText(quote.payAtHotel))).toBe("+ 524 ₴ туристичний збір — сплачується в готелі");
  });

  it("refuses multi-rate prebooks instead of guessing (an offer problem, not retried)", () => {
    const two = structuredClone(prebook.body);
    two.data.roomTypes[0].rates.push(two.data.roomTypes[0].rates[0]);
    expect(() => toCheckoutQuote(prebookSchema.parse(two), NOW)).toThrow();
  });

  it("flags changes reported by prebook", () => {
    const changed = structuredClone(prebook.body);
    Object.assign(changed.data, { priceDifferencePercent: 3.2, cancellationChanged: true, boardChanged: true });
    expect(toCheckoutQuote(prebookSchema.parse(changed), NOW).changes).toEqual({ price: true, cancellation: true, board: true });
  });
});

describe("toConfirmedBooking (sandbox book / get)", () => {
  it("normalises a confirmed booking and takes the earliest free-cancellation deadline", () => {
    const result = toConfirmedBooking(bookingSchema.parse(book.body).data);
    expect(result).toMatchObject({
      liteapiBookingId: "wHbOotXkt",
      prebookId: "4bFPhxkgn",
      hotelId: "lpbbb0c",
      checkIn: "2026-12-09",
      confirmed: true,
      refundable: true,
      refundableUntil: "2026-12-09T23:59:59.000Z",
    });
  });

  it("parses the GET shape the same way", () => {
    expect(toConfirmedBooking(bookingSchema.parse(booking.body).data).liteapiBookingId).toBe("wHbOotXkt");
  });

  it("does not promise a deadline when the policy is unreadable", () => {
    const broken = structuredClone(book.body);
    (broken.data.cancellationPolicies.cancelPolicyInfos as unknown[]).push({ cancelTime: "x", amount: "?" });
    expect(toConfirmedBooking(bookingSchema.parse(broken).data).refundableUntil).toBeNull();
  });
});

describe("checkout domain", () => {
  it("validates guest names and email with Ukrainian messages", () => {
    expect(guestSchema.parse({ firstName: " Олена ", lastName: "Сидоренко-Ковальʼ", email: " O@X.UA " })).toEqual({
      firstName: "Олена",
      lastName: "Сидоренко-Ковальʼ",
      email: "o@x.ua",
    });
    const bad = guestSchema.safeParse({ firstName: "<script>", lastName: "", email: "x" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.map((i) => i.message)).toContain("Лише літери, пробіл, апостроф або дефіс");
  });

  it("reports a price change only against the price the hotel page showed", () => {
    const quote = { price: { amount: 26648.98, currency: "UAH" }, changes: { price: false, cancellation: false, board: false } };
    expect(priceChange(quote, 26649)).toBeNull();
    expect(priceChange(quote, 25000)).toEqual({ from: 25000, to: 26649 });
    expect(priceChange(quote, null)).toBeNull();
  });

  it("has Ukrainian copy for every checkout failure", () => {
    for (const k of ["session", "invalid", "expired", "rate_gone", "pending", "failed", "unsaved"] as const) {
      expect(checkoutErrorMessage(k)).toMatch(/[а-яіїєґ]/i);
    }
  });
});

// Found by me in the sandbox E2E run: book reported a later free-cancellation deadline (16 Dec
// 23:59) than the prebook rate the guest saw (13 Dec), and we stored the later, more generous one.
// Review fix: a booking LiteAPI reports as non-refundable must never be stored as refundable.
describe("storedCancellation", () => {
  it("keeps the earliest deadline the guest was promised", async () => {
    const { storedCancellation } = await import("@/lib/booking/checkout");
    const q = (until: string | null, refundable = true) => ({ refundable, freeCancellationUntil: until });
    const b = (until: string | null, refundable: boolean | null = true) => ({ refundable, refundableUntil: until });
    expect(storedCancellation(q("2026-12-13T10:00:00.000Z"), b("2026-12-16T23:59:59.000Z"))).toEqual({ refundable: true, until: "2026-12-13T10:00:00.000Z" });
    expect(storedCancellation(q(null), b("2026-12-16T23:59:59.000Z"))).toEqual({ refundable: true, until: "2026-12-16T23:59:59.000Z" });
    expect(storedCancellation(q(null), b(null, null))).toEqual({ refundable: true, until: null });
    expect(storedCancellation(q(null, false), b("2026-12-16T23:59:59.000Z"))).toEqual({ refundable: false, until: null });
    expect(storedCancellation(q("2026-12-13T10:00:00.000Z"), b(null, false))).toEqual({ refundable: false, until: null });
  });

  it("reads a non-refundable booking as refundable: false", () => {
    const nrfn = structuredClone(book.body);
    nrfn.data.cancellationPolicies.refundableTag = "NRFN";
    expect(toConfirmedBooking(bookingSchema.parse(nrfn).data)).toMatchObject({ refundable: false, refundableUntil: null });
  });

  it("keeps an unconfirmed status visible", () => {
    const pending = structuredClone(book.body);
    pending.data.status = "PENDING";
    expect(toConfirmedBooking(bookingSchema.parse(pending).data)).toMatchObject({ status: "PENDING", confirmed: false });
  });
});

describe("toCancelOutcome (sandbox cancel)", () => {
  it("keeps only whether a fee applied, never LiteAPI's refund amount (our net cost)", () => {
    const outcome = toCancelOutcome(cancelBookingSchema.parse(cancel.body).data);
    expect(outcome).toEqual({ status: "cancelled", charged: false });
    expect(JSON.stringify(outcome)).not.toContain("23173");
  });
  it("flags charges by status or fee", () => {
    const withCharges = { ...cancel.body.data, status: "CANCELLED_WITH_CHARGES" as const };
    expect(toCancelOutcome(withCharges)).toEqual({ status: "cancelled_with_charges", charged: true });
    expect(toCancelOutcome({ ...cancel.body.data, status: "CANCELLED" as const, cancellation_fee: 500 }).charged).toBe(true);
  });
});

describe("toBookingState (cancel reconciliation)", () => {
  it.each([
    ["CANCELLED", "cancelled"],
    ["CANCELED", "cancelled"],
    ["CANCELLED_WITH_CHARGES", "cancelled"],
    ["confirmed", "confirmed"],
    ["CONFIRMED", "confirmed"],
    ["PENDING", "other"],
    ["", "other"],
    [null, "other"],
    [undefined, "other"],
  ])("%s → %s", (status, expected) => {
    expect(toBookingState(status)).toBe(expected);
  });
});
