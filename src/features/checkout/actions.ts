"use server";

import { redirect, RedirectType } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { bookPrebook, findBookingsByReference, LiteApiError } from "@/server/liteapi";
import { findOwnByReference, insertBooking } from "@/server/bookings";
import { clientReferenceFor, verifyCheckoutToken, type CheckoutPayload } from "@/server/checkout/token";
import { guestSchema, refundableUntil, type CheckoutErrorKind, type ConfirmedBooking } from "@/lib/booking/checkout";
import { fieldErrors } from "@/features/auth/schemas";
import { isAllowedImageUrl } from "@/lib/hotels/images";

export type CheckoutFormState = {
  error?: CheckoutErrorKind;
  fieldErrors?: Record<string, string>;
  values?: { firstName?: string; lastName?: string; email?: string };
};

/** A LiteAPI booking that really is the one this checkout asked for. */
function matches(b: ConfirmedBooking, p: CheckoutPayload): boolean {
  return b.confirmed && b.prebookId === p.pid && (b.hotelId === null || b.hotelId === p.hid) && b.checkIn === p.ci && b.checkOut === p.co;
}

/**
 * Book the quote signed into the page. Everything that matters (who, which prebook, price, room,
 * dates) comes from the signed token and LiteAPI — never from other form fields or the URL.
 * Safe to submit twice: the client reference is derived from user + prebook, LiteAPI refuses a
 * second booking with it (4005), and the DB has a unique constraint on it.
 */
export async function confirmBooking(_prev: CheckoutFormState, formData: FormData): Promise<CheckoutFormState> {
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const user = await getCurrentUser();
  if (!user) return { error: "session", values };

  const verified = verifyCheckoutToken(formData.get("token"));
  if (!verified.ok) return { error: verified.reason === "expired" ? "expired" : "invalid", values };
  const p = verified.payload;
  // The token was issued to someone else: never book their prebook.
  if (p.uid !== user.id) return { error: "invalid", values };

  const guest = guestSchema.safeParse(values);
  if (!guest.success) return { fieldErrors: fieldErrors(guest.error), values };

  const reference = clientReferenceFor(user.id, p.pid);
  let ourId: string | null = await findOwnByReference(user.id, reference).catch(() => null);

  if (!ourId) {
    let confirmed: ConfirmedBooking | null = null;
    try {
      const booked = await bookPrebook({ prebookId: p.pid, clientReference: reference, occupancyNumber: p.occ, guest: guest.data });
      if (!matches(booked, p)) return { error: "failed", values };
      confirmed = booked;
    } catch (error) {
      const kind = error instanceof LiteApiError ? error.kind : "unknown";
      if (kind === "no_availability" || kind === "invalid_request") return { error: "rate_gone", values };
      // Duplicate (already booked with this reference) or an unknown outcome: ask LiteAPI.
      if (kind === "duplicate" || kind === "timeout" || kind === "network" || kind === "upstream" || kind === "unknown") {
        const found = (await findBookingsByReference(reference).catch(() => [])).find((b) => matches(b, p));
        if (!found) return { error: kind === "duplicate" ? "failed" : "pending", values };
        confirmed = found;
      } else {
        return { error: "failed", values };
      }
    }

    try {
      ourId = await insertBooking({
        userId: user.id,
        liteapiBookingId: confirmed.liteapiBookingId,
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
        // Never more generous than the terms shown at checkout (sandbox book reports later deadlines).
        refundableUntil: refundableUntil({ refundable: p.rf, freeCancellationUntil: p.until }, confirmed.refundableUntil),
      });
    } catch {
      // Confirmed at LiteAPI but not saved: a retry is safe (4005 → lookup → insert).
      console.error(`[checkout] booking ${confirmed.liteapiBookingId} confirmed but not saved`);
      return { error: "unsaved", values };
    }
  }

  // Outside try (redirect throws); replace so Back doesn't return to a stale form.
  redirect(`/checkout?booking=${ourId}`, RedirectType.replace);
}
