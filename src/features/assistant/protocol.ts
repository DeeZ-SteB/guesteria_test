import { z } from "zod";
import { isAllowedImageUrl } from "@/lib/hotels/images";
import { cleanUserText } from "@/lib/text/html-to-text";

/** Shared between the route handler and the browser. Everything that crosses is validated. */

export const MESSAGE_MAX = 1000;

const isoDate = z.iso.date();

export const pageContextSchema = z.discriminatedUnion("page", [
  z.object({
    page: z.literal("search"),
    cityId: z.string().max(64).optional(),
    checkin: isoDate.optional(),
    checkout: isoDate.optional(),
    adults: z.number().int().min(1).max(8).optional(),
  }),
  z.object({
    page: z.literal("hotel"),
    hotelId: z.string().regex(/^[a-z0-9]{3,32}$/i),
    checkin: isoDate.optional(),
    checkout: isoDate.optional(),
    adults: z.number().int().min(1).max(8).optional(),
  }),
  z.object({ page: z.literal("trip"), bookingId: z.uuid() }),
  z.object({ page: z.literal("other") }),
]);
export type PageContext = z.infer<typeof pageContextSchema>;

/** Anonymous history: plain text only — a client can never send tool calls or tool results. */
export const anonHistorySchema = z
  .array(
    z.discriminatedUnion("role", [
      z.object({ role: z.literal("user"), text: z.string().max(MESSAGE_MAX) }),
      z.object({ role: z.literal("assistant"), text: z.string().max(4000) }),
    ]),
  )
  .max(20)
  .refine((h) => h.reduce((n, m) => n + m.text.length, 0) <= 24_000, "history too long");

export const assistantRequestSchema = z.object({
  message: z
    .string()
    .transform(cleanUserText)
    .pipe(z.string().min(1).max(MESSAGE_MAX)),
  context: pageContextSchema.catch({ page: "other" }),
  threadId: z.uuid().nullish(),
  history: anonHistorySchema.optional(),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

// ---------------------------------------------------------------- UI blocks

/** Internal links only: never javascript:, never another origin. */
const internalHref = z.string().max(2400).regex(/^\/(hotels|checkout|account\/trips)(\/|\?)/);
const image = z.string().max(500).refine(isAllowedImageUrl).nullable();
const money = z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) });

export const uiBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hotel_cards"),
    hotels: z
      .array(
        z.object({
          hotelId: z.string(),
          name: z.string().max(200),
          imageUrl: image,
          stars: z.number().nullable(),
          rating: z.number().nullable(),
          price: money.nullable(),
          href: internalHref,
        }),
      )
      .max(8),
  }),
  z.object({
    type: z.literal("rate_cards"),
    hotelName: z.string().max(200),
    rates: z
      .array(
        z.object({
          roomName: z.string().max(200),
          board: z.string().max(80),
          refundable: z.boolean(),
          refundableUntil: z.string().nullable(),
          price: money,
          href: internalHref,
        }),
      )
      .max(8),
  }),
  z.object({
    type: z.literal("checkout_card"),
    hotelName: z.string().max(200),
    roomName: z.string().max(200),
    board: z.string().max(80),
    price: money,
    href: internalHref,
  }),
  z.object({
    type: z.literal("trip_cards"),
    trips: z
      .array(
        z.object({
          bookingId: z.uuid(),
          hotelName: z.string().max(200),
          checkIn: isoDate,
          checkOut: isoDate,
          status: z.enum(["pending", "confirmed", "cancelled"]),
          checkedIn: z.boolean().nullable(),
          href: internalHref,
        }),
      )
      .max(10),
  }),
  z.object({
    type: z.literal("confirm_action"),
    actionId: z.uuid(),
    kind: z.enum(["check_in", "guest_request"]),
    title: z.string().max(120),
    summary: z.array(z.string().max(600)).max(6),
    expiresAt: z.string(),
  }),
]);
export type UiBlock = z.infer<typeof uiBlockSchema>;

// ---------------------------------------------------------------- stream events

export type DoneReason = "end_turn" | "refusal" | "max_tokens" | "step_limit" | "aborted" | "timeout";
export type ErrorCode = "refused" | "truncated" | "daily_cap" | "overloaded" | "upstream" | "rate_limited";

export const streamEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("meta"), data: z.object({ threadId: z.uuid().nullable() }) }),
  z.object({ event: z.literal("status"), data: z.object({ tool: z.string().max(40), label: z.string().max(80) }) }),
  z.object({ event: z.literal("text"), data: z.object({ delta: z.string().max(20_000) }) }),
  z.object({ event: z.literal("reset"), data: z.object({}) }),
  z.object({ event: z.literal("block"), data: z.object({ block: uiBlockSchema }) }),
  z.object({
    event: z.literal("error"),
    data: z.object({ code: z.string().max(40), message: z.string().max(300), retryable: z.boolean(), retryAfter: z.number().optional() }),
  }),
  z.object({ event: z.literal("done"), data: z.object({ stop: z.string().max(20) }) }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

/** Errors returned as JSON before the stream starts. */
export type PreflightError = { error: "invalid" | "session" | "thread_full" | "too_long" | "rate_limited" | "daily_cap" | "forbidden"; retryAfter?: number };
