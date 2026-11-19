import "server-only";
import { findBookingsByReference } from "@/server/liteapi";
import { confirmAttempt, notePendingLiteApiId, releaseAttempt, type OwnBooking } from "@/server/bookings";
import { storedCancellation } from "@/lib/booking/checkout";

const SETTLED_AFTER_MS = 3 * 60 * 1000;

export type ViewState = "confirmed" | "pending" | "cancelled" | "gone";

/**
 * Opening /checkout?booking=<id> for a still-pending attempt asks LiteAPI what happened, so a
 * guest who reloaded or came back later sees the real outcome — without ever booking again.
 */
export async function resolveForView(booking: OwnBooking): Promise<ViewState> {
  if (booking.status === "confirmed") return "confirmed";
  if (booking.status === "cancelled") return "cancelled";
  let found;
  try {
    found = await findBookingsByReference(booking.client_reference);
  } catch {
    return "pending";
  }
  const ours = found.find(
    (b) => b.prebookId === booking.prebook_id && b.hotelId === booking.hotel_id && b.checkIn === booking.check_in && b.checkOut === booking.check_out,
  );
  if (ours?.confirmed) {
    const terms = storedCancellation({ refundable: booking.refundable, freeCancellationUntil: booking.refundable_until }, ours);
    try {
      await confirmAttempt(booking.id, { liteapiBookingId: ours.liteapiBookingId, refundable: terms.refundable, refundableUntil: terms.until });
      return "confirmed";
    } catch {
      return "pending";
    }
  }
  if (ours) {
    await notePendingLiteApiId(booking.id, ours.liteapiBookingId);
    return "pending";
  }
  if (Date.now() - Date.parse(booking.created_at) > SETTLED_AFTER_MS) {
    await releaseAttempt(booking.id);
    return "gone";
  }
  return "pending";
}
