"use server";

import { redirect, RedirectType } from "next/navigation";
import { verifiedBookingUser } from "@/server/auth";
import { bookPrebook, findBookingsByReference, LiteApiError } from "@/server/liteapi";
import { claimAttempt, confirmAttempt, findOwnAttempt, notePendingLiteApiId, releaseAttempt, type Attempt } from "@/server/bookings";
import { clientReferenceFor, verifyCheckoutToken, type CheckoutPayload } from "@/server/checkout/token";
import { guestSchema, storedCancellation, type CheckoutErrorKind, type ConfirmedBooking } from "@/lib/booking/checkout";
import { fieldErrors } from "@/features/auth/schemas";
import { isAllowedImageUrl } from "@/lib/hotels/images";
import { hitAll } from "@/server/rate-limit";

export type CheckoutFormState = {
  error?: CheckoutErrorKind;
  fieldErrors?: Record<string, string>;
  values?: { firstName?: string; lastName?: string; email?: string };
  /** The token this attempt used: re-sent on retry even if the page re-rendered with a new one. */
  token?: string;
};

/** An attempt whose book call has certainly finished (maxDuration is 120 s). */
const SETTLED_AFTER_MS = 3 * 60 * 1000;

type Match = "match" | "mismatch";

/** Is this LiteAPI booking the one this checkout asked for? */
function compare(b: ConfirmedBooking, p: CheckoutPayload, reference: string): Match {
  const same =
    b.prebookId === p.pid &&
    b.hotelId === p.hid &&
    b.checkIn === p.ci &&
    b.checkOut === p.co &&
    (b.clientReference === null || b.clientReference === reference);
  return same ? "match" : "mismatch";
}

type Resolution = { kind: "confirmed"; booking: ConfirmedBooking } | { kind: "unconfirmed"; booking: ConfirmedBooking } | { kind: "none" } | { kind: "unknown" };

/** Asks LiteAPI what happened to this reference. Lookup failures are "unknown", not "none". */
async function resolveByReference(reference: string, p: CheckoutPayload): Promise<Resolution> {
  let found: ConfirmedBooking[];
  try {
    found = await findBookingsByReference(reference);
  } catch {
    return { kind: "unknown" };
  }
  const ours = found.find((b) => b.prebookId === p.pid);
  if (!ours) return { kind: "none" };
  if (compare(ours, p, reference) === "mismatch") {
    console.error(`[checkout] booking ${ours.liteapiBookingId} does not match its checkout`);
    return { kind: "unknown" };
  }
  return ours.confirmed ? { kind: "confirmed", booking: ours } : { kind: "unconfirmed", booking: ours };
}

async function finish(attempt: Attempt, booking: ConfirmedBooking, p: CheckoutPayload): Promise<"saved" | "unsaved"> {
  const terms = storedCancellation({ refundable: p.rf, freeCancellationUntil: p.until }, booking);
  try {
    await confirmAttempt(attempt.id, { liteapiBookingId: booking.liteapiBookingId, refundable: terms.refundable, refundableUntil: terms.until });
    return "saved";
  } catch {
    console.error(`[checkout] booking ${booking.liteapiBookingId} confirmed but not saved`);
    return "unsaved";
  }
}

/**
 * Book the quote signed into the page. Who, which prebook, price, room and dates come from the
 * signed token and LiteAPI — never from other form fields or the URL.
 *
 * Exactly-once: the attempt is recorded (unique client_reference) BEFORE LiteAPI is called, so
 * only one request ever books; every other submit, reload or retry resolves the outcome by looking
 * the reference up. An expired token can still resolve an attempt, but never start a new one.
 */
export async function confirmBooking(_prev: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const rawToken = formData.get("token");
  const keep = { values, token: typeof rawToken === "string" ? rawToken : undefined };

  const auth = await verifiedBookingUser();
  if (auth.status !== "ok") return { error: auth.status, ...keep };
  const user = auth.user;

  const verified = verifyCheckoutToken(rawToken, Date.now(), { allowExpired: true });
  if (!verified.ok) return { error: "invalid", ...keep };
  const p = verified.payload;
  if (p.uid !== user.id) return { error: "invalid", ...keep }; // issued to someone else
  const reference = clientReferenceFor(user.id, p.pid);

  let existing: Attempt | null;
  try {
    existing = await findOwnAttempt(user.id, reference);
  } catch {
    return { error: "pending", ...keep };
  }

  // ---- an attempt already exists: never book again, only resolve ----
  if (existing) {
    if (existing.status !== "pending") redirect(`/checkout?booking=${existing.id}`, RedirectType.replace);
    const outcome = await settle(existing, reference, p);
    if (outcome === "saved") redirect(`/checkout?booking=${existing.id}`, RedirectType.replace);
    return { error: outcome, ...keep };
  }

  // ---- no attempt yet: only a fresh token may start one ----
  if (verified.expired) return { error: "expired", ...keep };
  const guest = guestSchema.safeParse(values);
  if (!guest.success) return { fieldErrors: fieldErrors(guest.error), ...keep };
  // Spending caps apply only to starting a NEW booking; resolving an existing attempt is never blocked.
  const allowed = await hitAll([
    ["bookUserHour", user.id],
    ["bookUserDay", user.id],
    ["bookAll", "all"],
  ]);
  if (!allowed.allowed) return { error: "rate_limited", ...keep };

  let claim: Awaited<ReturnType<typeof claimAttempt>>;
  try {
    claim = await claimAttempt({
      userId: user.id,
      clientReference: reference,
      prebookId: p.pid,
      hotelId: p.hid,
      hotelName: p.name,
      hotelImage: isAllowedImageUrl(p.img) ? p.img : null,
      city: p.city,
      checkIn: p.ci,
      checkOut: p.co,
      adults: p.ad,
      roomName: p.room,
      board: p.board,
      totalAmount: p.amt,
      currency: p.cur,
      refundable: p.rf,
      refundableUntil: p.until,
    });
  } catch {
    return { error: "failed", ...keep };
  }
  if (!claim.claimed) {
    // A concurrent submit won the race and is booking right now.
    const outcome = await settle(claim.attempt, reference, p);
    if (outcome === "saved") redirect(`/checkout?booking=${claim.attempt.id}`, RedirectType.replace);
    return { error: outcome, ...keep };
  }

  const attempt = claim.attempt;
  let booked: ConfirmedBooking | null = null;
  let failure: string | null = null;
  try {
    booked = await bookPrebook({ prebookId: p.pid, clientReference: reference, occupancyNumber: p.occ, guest: guest.data });
  } catch (error) {
    failure = error instanceof LiteApiError ? `${error.kind}:${error.code ?? ""}` : "unknown:";
  }

  if (booked) {
    if (compare(booked, p, reference) === "mismatch") {
      console.error(`[checkout] booking ${booked.liteapiBookingId} does not match its checkout`);
      await notePendingLiteApiId(attempt.id, booked.liteapiBookingId);
      return { error: "support", ...keep };
    }
    if (!booked.confirmed) {
      await notePendingLiteApiId(attempt.id, booked.liteapiBookingId);
      return { error: "pending", ...keep };
    }
    const saved = await finish(attempt, booked, p);
    if (saved === "unsaved") return { error: "unsaved", ...keep };
    redirect(`/checkout?booking=${attempt.id}`, RedirectType.replace);
  }

  // ---- book threw: find out what really happened before telling the guest anything ----
  const [kind, code] = (failure ?? "unknown:").split(":");
  const resolution = await resolveByReference(reference, p);
  if (resolution.kind === "confirmed") {
    const saved = await finish(attempt, resolution.booking, p);
    if (saved === "unsaved") return { error: "unsaved", ...keep };
    redirect(`/checkout?booking=${attempt.id}`, RedirectType.replace);
  }
  if (resolution.kind === "unconfirmed") {
    await notePendingLiteApiId(attempt.id, resolution.booking.liteapiBookingId);
    return { error: "pending", ...keep };
  }
  if (resolution.kind === "unknown" || kind === "duplicate" || kind === "timeout" || kind === "network" || kind === "upstream" || kind === "unknown") {
    // 4005 proves a booking exists; a timeout may still complete. Keep the attempt, say pending.
    if (kind === "duplicate") console.error(`[checkout] duplicate reference ${reference} not found by lookup`);
    return { error: "pending", ...keep };
  }
  // A definite rejection and LiteAPI confirms nothing was booked: free the attempt.
  await releaseAttempt(attempt.id);
  if (kind === "invalid_request" && code === "4000") return { error: "guest_rejected", ...keep };
  return { error: kind === "no_availability" || kind === "invalid_request" ? "rate_gone" : "failed", ...keep };
}

/** Resolve an existing pending attempt (another submit, a retry or a reload). */
async function settle(attempt: Attempt, reference: string, p: CheckoutPayload): Promise<CheckoutErrorKind | "saved"> {
  const resolution = await resolveByReference(reference, p);
  if (resolution.kind === "confirmed") {
    const saved = await finish(attempt, resolution.booking, p);
    return saved === "saved" ? "saved" : "unsaved";
  }
  if (resolution.kind === "unconfirmed" || resolution.kind === "unknown") return "pending";
  // Nothing at LiteAPI. Only once the original book call has certainly ended may we free it.
  if (Date.now() - Date.parse(attempt.createdAt) > SETTLED_AFTER_MS) {
    await releaseAttempt(attempt.id);
    return "expired";
  }
  return "pending";
}
