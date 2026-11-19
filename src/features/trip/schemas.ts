import { z } from "zod";
import { ARRIVAL_SLOTS, DETAILS_REQUIRED, REQUEST_TYPES, type GuestRequestView } from "@/lib/booking/trip-page";
import { cleanUserText } from "@/lib/text/html-to-text";

const cleanText = (max: number) =>
  z
    .string()
    .transform(cleanUserText)
    .pipe(z.string().max(max, { error: `До ${max} символів` }));

export const checkinInputSchema = z.object({
  bookingId: z.uuid(),
  arrivalTime: z.enum(ARRIVAL_SLOTS, { error: "Оберіть час прибуття" }),
  notes: cleanText(500).optional().default(""),
});
export type CheckinInput = z.infer<typeof checkinInputSchema>;

export const guestRequestInputSchema = z
  .object({
    requestId: z.uuid(),
    bookingId: z.uuid(),
    type: z.enum(REQUEST_TYPES),
    details: cleanText(500).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (DETAILS_REQUIRED.has(v.type) && v.details.length === 0) {
      ctx.addIssue({ code: "custom", path: ["details"], message: "Опишіть, що саме потрібно" });
    }
  });
export type GuestRequestInput = z.infer<typeof guestRequestInputSchema>;

/** A guest_requests row from the DB or a Realtime payload. Anything else is dropped. */
export const guestRequestRowSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(REQUEST_TYPES),
    details: z.string().max(500).nullable(),
    status: z.enum(["sent", "confirmed", "declined"]),
    source: z.enum(["guest", "assistant"]),
    created_at: z.string().min(10),
    updated_at: z.string().min(10),
  })
  .transform(
    (r): GuestRequestView => ({
      id: r.id,
      type: r.type,
      details: r.details,
      status: r.status,
      source: r.source,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  );

export const GUEST_REQUEST_COLUMNS = "id, type, details, status, source, created_at, updated_at";

export type CheckinView = { arrivalTime: string; notes: string; completedAt: string };

export const checkinRowSchema = z
  .object({ arrival_time: z.string().regex(/^\d{2}:\d{2}/), notes: z.string().nullable(), completed_at: z.string() })
  .transform((r): CheckinView => ({ arrivalTime: r.arrival_time.slice(0, 5), notes: r.notes ?? "", completedAt: r.completed_at }));
