import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getHotel, getReviews, getRoomRates, searchHotels } from "@/server/liteapi";
import { getOwnBooking, listOwnBookings } from "@/server/bookings";
import { listCheckedInIds, listGuestRequests } from "@/server/trip";
import { CITIES, findCity } from "@/lib/cities";
import { nightsBetween, staySchema, type Stay } from "@/lib/booking/stay";
import { filterOffers } from "@/lib/hotels/rates";
import { checkoutHref, hotelHref } from "@/lib/search/params";
import { isAllowedImageUrl } from "@/lib/hotels/images";
import { cancellationText } from "@/lib/cancellation";
import { formatMoney } from "@/lib/money";
import {
  ARRIVAL_SLOTS,
  checkinEligibility,
  openTypes,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPES,
  requestEligibility,
  requestTypeAvailable,
} from "@/lib/booking/trip-page";
import { checkinInputSchema, guestRequestInputSchema } from "@/features/trip/schemas";
import type { UiBlock } from "@/features/assistant/protocol";
import { createDraft } from "./store";
import { untrustedValue, wrapUntrusted } from "./untrusted";

export type ToolCtx = { userId: string | null; threadId: string | null; today: string };
export type ToolOutput = { text: string; isError?: boolean; block?: UiBlock };

type Tool<I> = {
  definition: BetaTool;
  /** Who may call it: anonymous visitors get only public tools. */
  access: "public" | "user";
  /** Shown while the tool runs. */
  label: string;
  input: z.ZodType<I>;
  run: (input: I, ctx: ToolCtx) => Promise<ToolOutput>;
};

const fail = (text: string): ToolOutput => ({ text, isError: true });

/** strict tool schema: every property required, optional ones nullable, nothing extra. */
function schema(properties: Record<string, unknown>): BetaTool.InputSchema {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false } as BetaTool.InputSchema;
}

const date = { type: "string", description: "YYYY-MM-DD" };
const adults = { type: "integer", description: "Adults, 1–8" };
const hotelId = { type: "string", description: "Hotel id from search_hotels or the verified context" };
const nullable = (t: Record<string, unknown>) => ({ ...t, type: [t.type as string, "null"] });

const stayInput = { check_in: z.iso.date(), check_out: z.iso.date(), adults: z.number().int().min(1).max(8) };
const toStay = (i: { check_in: string; check_out: string; adults: number }): Stay | null => {
  const parsed = staySchema.safeParse({ checkIn: i.check_in, checkOut: i.check_out, adults: i.adults });
  return parsed.success ? parsed.data : null;
};

/** Short handle for an offer. The ~1.2k-char offer token never reaches the model, which cannot forge one. */
export const rateRef = (offerId: string) => createHash("sha256").update(offerId).digest("hex").slice(0, 10);

const liteApiFail = (what: string) => fail(`${what} is temporarily unavailable. Tell the guest and suggest trying again later.`);

// ---------------------------------------------------------------- public tools

const searchHotelsTool: Tool<{ city_id: string; check_in: string; check_out: string; adults: number; max_price_per_night: number | null; min_rating: number | null }> = {
  access: "public",
  label: "Шукаю готелі…",
  definition: {
    name: "search_hotels",
    description: `Find hotels with live prices in a supported city for given dates. Returns up to 5 hotels (cards are shown to the guest). Supported city_id values: ${CITIES.map((c) => c.id).join(", ")}.`,
    strict: true,
    input_schema: schema({
      city_id: { type: "string", enum: CITIES.map((c) => c.id) },
      check_in: date,
      check_out: date,
      adults,
      max_price_per_night: nullable({ type: "number", description: "UAH per night, or null" }),
      min_rating: nullable({ type: "number", description: "Guest rating 0–10, or null" }),
    }),
  },
  input: z.object({
    city_id: z.string(),
    ...stayInput,
    max_price_per_night: z.number().positive().max(1_000_000).nullable(),
    min_rating: z.number().min(0).max(10).nullable(),
  }),
  async run(i) {
    const city = findCity(i.city_id);
    const stay = toStay(i);
    if (!city) return fail(`Unknown city. Supported: ${CITIES.map((c) => c.id).join(", ")}`);
    if (!stay) return fail("Invalid dates: check_out must be after check_in, at most 30 nights.");
    let hotels;
    try {
      hotels = await searchHotels({ cityId: city.id, ...stay });
    } catch {
      return liteApiFail("Hotel search");
    }
    const nights = nightsBetween(stay.checkIn, stay.checkOut);
    const picked = hotels
      .filter((h) => (i.max_price_per_night === null || h.price.amount / nights <= i.max_price_per_night) && (i.min_rating === null || (h.rating ?? 0) >= i.min_rating))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.price.amount - b.price.amount)
      .slice(0, 5);
    if (picked.length === 0) return { text: `No hotels in ${city.id} match these filters for ${stay.checkIn} → ${stay.checkOut} (${hotels.length} found without filters).` };
    const lines = picked.map(
      (h) => `- id ${h.id}: ${untrustedValue(h.name)}; stars ${h.stars ?? "?"}; rating ${h.rating ?? "?"}/10 (${h.reviewCount} reviews); total ${formatMoney(h.price)} for ${nights} nights`,
    );
    return {
      text: `Hotels in ${city.id}, ${stay.checkIn} → ${stay.checkOut}, ${stay.adults} adults (cards shown to the guest):\n${lines.join("\n")}`,
      block: {
        type: "hotel_cards",
        hotels: picked.map((h) => ({
          hotelId: h.id,
          name: h.name.slice(0, 200),
          imageUrl: isAllowedImageUrl(h.photo) && h.photo.length <= 500 ? h.photo : null,
          stars: h.stars,
          rating: h.rating,
          price: h.price,
          href: hotelHref(h.id, { ...stay, cityId: city.id }),
        })),
      },
    };
  },
};

const hotelDetailsTool: Tool<{ hotel_id: string }> = {
  access: "public",
  label: "Дивлюся інформацію про готель…",
  definition: {
    name: "get_hotel_details",
    description: "Facts about one hotel: address, check-in/out times, facilities, policies, description and recent guest reviews. Use it to answer questions about a hotel.",
    strict: true,
    input_schema: schema({ hotel_id: hotelId }),
  },
  input: z.object({ hotel_id: z.string().regex(/^[a-z0-9]{3,32}$/i) }),
  async run(i) {
    let hotel;
    try {
      hotel = await getHotel(i.hotel_id);
    } catch {
      return liteApiFail("Hotel information");
    }
    const reviews = await getReviews(i.hotel_id).catch(() => []);
    const data = [
      `name: ${hotel.name}`,
      `address: ${hotel.address ?? "unknown"}, ${hotel.city ?? ""}`,
      `stars: ${hotel.stars ?? "unknown"}; rating: ${hotel.rating ?? "unknown"}/10 (${hotel.reviewCount} reviews)`,
      `check-in from: ${hotel.checkIn ?? "unknown"}; check-out until: ${hotel.checkOut ?? "unknown"}`,
      `facilities: ${hotel.facilities.slice(0, 60).join(", ") || "unknown"}`,
      `important information: ${hotel.importantInfo.join(" ") || "none"}`,
      `description: ${hotel.descriptionParagraphs.join(" ")}`,
    ].join("\n");
    const reviewText = reviews
      .slice(0, 8)
      .map((r) => `- score ${r.score ?? "?"}: ${[r.headline, r.pros && `+ ${r.pros}`, r.cons && `- ${r.cons}`].filter(Boolean).join(" ").slice(0, 400)}`)
      .join("\n");
    return {
      text: `${wrapUntrusted("hotel_data", data, 6000)}\n${reviewText ? wrapUntrusted("hotel_reviews", reviewText, 3600) : "No reviews available."}`,
    };
  },
};

type RatesInput = { hotel_id: string; check_in: string; check_out: string; adults: number; breakfast_only: boolean | null; free_cancellation_only: boolean | null };

const roomRatesTool: Tool<RatesInput> = {
  access: "public",
  label: "Перевіряю номери й ціни…",
  definition: {
    name: "get_room_rates",
    description: "Live room rates for a hotel and dates (up to 6, cheapest first; cards are shown to the guest). Each rate has a rate_ref for open_checkout.",
    strict: true,
    input_schema: schema({
      hotel_id: hotelId,
      check_in: date,
      check_out: date,
      adults,
      breakfast_only: nullable({ type: "boolean" }),
      free_cancellation_only: nullable({ type: "boolean" }),
    }),
  },
  input: z.object({ hotel_id: z.string().regex(/^[a-z0-9]{3,32}$/i), ...stayInput, breakfast_only: z.boolean().nullable(), free_cancellation_only: z.boolean().nullable() }),
  async run(i) {
    const stay = toStay(i);
    if (!stay) return fail("Invalid dates: check_out must be after check_in, at most 30 nights.");
    let offers;
    try {
      offers = await getRoomRates(i.hotel_id, stay);
    } catch {
      return liteApiFail("Room rates");
    }
    const hotel = await getHotel(i.hotel_id).catch(() => null);
    const rates = filterOffers(offers, { breakfast: i.breakfast_only === true, freeCancel: i.free_cancellation_only === true })
      .flatMap((o) => o.rates.map((r) => ({ room: o.name, rate: r })))
      .sort((a, b) => a.rate.price.amount - b.rate.price.amount)
      .slice(0, 6);
    if (rates.length === 0) return { text: "No rates for these dates and filters." };
    const hotelName = hotel?.name ?? "Готель";
    const cards = rates.flatMap(({ room, rate }) => {
      try {
        return [
          {
            roomName: room.slice(0, 200),
            board: rate.boardLabel.slice(0, 80),
            refundable: rate.refundable,
            refundableUntil: rate.freeCancellationUntil,
            price: rate.price,
            href: checkoutHref({ offerId: rate.offerId, hotelId: i.hotel_id, stay, price: Math.round(rate.price.amount) }),
          },
        ];
      } catch {
        return [];
      }
    });
    const lines = rates.map(
      ({ room, rate }) =>
        `- rate_ref ${rateRef(rate.offerId)}: ${untrustedValue(room)}; ${rate.boardLabel}; ${cancellationText(rate)}; total ${formatMoney(rate.price)}`,
    );
    return {
      text: `Rates at ${untrustedValue(hotelName)} for ${stay.checkIn} → ${stay.checkOut}, ${stay.adults} adults (cards shown):\n${lines.join("\n")}`,
      block: { type: "rate_cards", hotelName: hotelName.slice(0, 200), rates: cards },
    };
  },
};

const openCheckoutTool: Tool<RatesInput & { rate_ref: string }> = {
  access: "public",
  label: "Готую оформлення…",
  definition: {
    name: "open_checkout",
    description: "When the guest wants to book a rate: shows a button to the checkout page, where the guest reviews and books it themselves. Never books anything.",
    strict: true,
    input_schema: schema({ hotel_id: hotelId, check_in: date, check_out: date, adults, rate_ref: { type: "string" }, breakfast_only: nullable({ type: "boolean" }), free_cancellation_only: nullable({ type: "boolean" }) }),
  },
  input: z.object({
    hotel_id: z.string().regex(/^[a-z0-9]{3,32}$/i),
    ...stayInput,
    rate_ref: z.string().regex(/^[0-9a-f]{10}$/),
    breakfast_only: z.boolean().nullable(),
    free_cancellation_only: z.boolean().nullable(),
  }),
  async run(i) {
    const stay = toStay(i);
    if (!stay) return fail("Invalid dates.");
    let offers;
    try {
      offers = await getRoomRates(i.hotel_id, stay);
    } catch {
      return liteApiFail("Checkout");
    }
    // Live rates again: the rate must still exist; the model only ever knows its short ref.
    for (const offer of offers) {
      const rate = offer.rates.find((r) => rateRef(r.offerId) === i.rate_ref);
      if (!rate) continue;
      const hotel = await getHotel(i.hotel_id).catch(() => null);
      return {
        text: `Checkout button shown for ${untrustedValue(offer.name)}, total ${formatMoney(rate.price)}. The guest books it on the checkout page.`,
        block: {
          type: "checkout_card",
          hotelName: (hotel?.name ?? "Готель").slice(0, 200),
          roomName: offer.name.slice(0, 200),
          board: rate.boardLabel.slice(0, 80),
          price: rate.price,
          href: checkoutHref({ offerId: rate.offerId, hotelId: i.hotel_id, stay, price: Math.round(rate.price.amount) }),
        },
      };
    }
    return fail("This rate is no longer available. Call get_room_rates again for current rates.");
  },
};

// ---------------------------------------------------------------- signed-in tools (user id from the session only)

const listTripsTool: Tool<{ scope: "upcoming" | "past" | "all" }> = {
  access: "user",
  label: "Дивлюся ваші поїздки…",
  definition: {
    name: "list_my_trips",
    description: "The signed-in guest's bookings (cards shown). Use booking_id from here for check-in and requests.",
    strict: true,
    input_schema: schema({ scope: { type: "string", enum: ["upcoming", "past", "all"] } }),
  },
  input: z.object({ scope: z.enum(["upcoming", "past", "all"]) }),
  async run(i, ctx) {
    if (!ctx.userId) return fail("sign_in_required");
    const rows = (await listOwnBookings(ctx.userId)).filter((b) =>
      i.scope === "all" ? true : i.scope === "upcoming" ? b.check_out >= ctx.today && b.status !== "cancelled" : b.check_out < ctx.today || b.status === "cancelled",
    );
    if (rows.length === 0) return { text: `No ${i.scope} trips.` };
    const checked = await listCheckedInIds(ctx.userId, rows.map((r) => r.id)).catch(() => null);
    const trips = rows.slice(0, 10);
    return {
      text: trips
        .map((b) => `- booking_id ${b.id}: ${untrustedValue(b.hotel_name)}; ${b.check_in} → ${b.check_out}; ${b.status}; online check-in ${checked ? (checked.has(b.id) ? "done" : "not done") : "unknown"}`)
        .join("\n"),
      block: {
        type: "trip_cards",
        trips: trips.map((b) => ({
          bookingId: b.id,
          hotelName: b.hotel_name.slice(0, 200),
          checkIn: b.check_in,
          checkOut: b.check_out,
          status: b.status,
          checkedIn: checked ? checked.has(b.id) : null,
          href: b.status === "pending" ? `/checkout?booking=${b.id}` : `/account/trips/${b.id}`,
        })),
      },
    };
  },
};

const submitCheckinTool: Tool<{ booking_id: string; arrival_time: string; notes: string | null }> = {
  access: "user",
  label: "Готую чекін…",
  definition: {
    name: "submit_check_in",
    description: "Prepare online check-in (arrival time in 30-minute steps, optional wishes ≤ 500 chars). Creates a draft; the guest must confirm it on the card.",
    strict: true,
    input_schema: schema({
      booking_id: { type: "string", description: "booking_id from the verified context or list_my_trips" },
      arrival_time: { type: "string", enum: ARRIVAL_SLOTS },
      notes: nullable({ type: "string" }),
    }),
  },
  input: z.object({ booking_id: z.uuid(), arrival_time: z.string(), notes: z.string().nullable() }),
  async run(i, ctx) {
    if (!ctx.userId) return fail("sign_in_required");
    const parsed = checkinInputSchema.safeParse({ bookingId: i.booking_id, arrivalTime: i.arrival_time, notes: i.notes ?? "" });
    if (!parsed.success) return fail(`invalid_arguments: ${parsed.error.issues.map((x) => x.path.join(".")).join(", ")}`);
    const booking = await getOwnBooking(ctx.userId, parsed.data.bookingId).catch(() => null);
    if (!booking) return fail("not_found: this guest has no such booking.");
    if (!checkinEligibility({ status: booking.status, checkIn: booking.check_in, checkOut: booking.check_out }, ctx.today).ok) {
      return fail("closed: online check-in is no longer available for this booking.");
    }
    const notes = parsed.data.notes || null;
    const draft = await createDraft(ctx.userId, booking.id, ctx.threadId, { type: "check_in", payload: { arrival_time: parsed.data.arrivalTime, notes } });
    return {
      text: "Draft created and shown to the guest. It is NOT done until they press «Підтвердити».",
      block: {
        type: "confirm_action",
        actionId: draft.id,
        kind: "check_in",
        title: "Онлайн-чекін",
        summary: [booking.hotel_name.slice(0, 200), `${booking.check_in} → ${booking.check_out}`, `Прибуття о ${parsed.data.arrivalTime}`, ...(notes ? [`Побажання: ${notes}`] : [])],
        expiresAt: draft.expiresAt,
      },
    };
  },
};

const createRequestTool: Tool<{ booking_id: string; type: (typeof REQUEST_TYPES)[number]; details: string | null }> = {
  access: "user",
  label: "Готую запит до готелю…",
  definition: {
    name: "create_guest_request",
    description: "Prepare a request to the hotel (early check-in, late check-out, transfer, breakfast in the room, or other — including questions you cannot answer from the data). Details ≤ 500 chars, required for transfer and other. Creates a draft; the guest must confirm it on the card.",
    strict: true,
    input_schema: schema({
      booking_id: { type: "string" },
      type: { type: "string", enum: [...REQUEST_TYPES] },
      details: nullable({ type: "string" }),
    }),
  },
  input: z.object({ booking_id: z.uuid(), type: z.enum(REQUEST_TYPES), details: z.string().nullable() }),
  async run(i, ctx) {
    if (!ctx.userId) return fail("sign_in_required");
    const parsed = guestRequestInputSchema.safeParse({ requestId: crypto.randomUUID(), bookingId: i.booking_id, type: i.type, details: i.details ?? "" });
    if (!parsed.success) return fail(`invalid_arguments: ${parsed.error.issues.map((x) => x.path.join(".")).join(", ")}`);
    const booking = await getOwnBooking(ctx.userId, parsed.data.bookingId).catch(() => null);
    if (!booking) return fail("not_found: this guest has no such booking.");
    const stay = { status: booking.status, checkIn: booking.check_in, checkOut: booking.check_out };
    if (!requestEligibility(stay, ctx.today).ok) return fail("closed: requests are no longer possible for this booking.");
    if (!requestTypeAvailable(parsed.data.type, stay, ctx.today)) return fail("type_closed: this request no longer applies to the dates.");
    const open = openTypes(await listGuestRequests(ctx.userId, booking.id).catch(() => []));
    if (open.has(parsed.data.type)) return fail("duplicate_open: the same request is already waiting for the hotel's answer.");
    const details = parsed.data.details || null;
    const draft = await createDraft(ctx.userId, booking.id, ctx.threadId, { type: "guest_request", payload: { type: parsed.data.type, details } });
    return {
      text: "Draft created and shown to the guest. It is NOT sent until they press «Підтвердити».",
      block: {
        type: "confirm_action",
        actionId: draft.id,
        kind: "guest_request",
        title: `Запит: ${REQUEST_TYPE_LABEL[parsed.data.type]}`,
        summary: [booking.hotel_name.slice(0, 200), `${booking.check_in} → ${booking.check_out}`, ...(details ? [details] : [])],
        expiresAt: draft.expiresAt,
      },
    };
  },
};

// ---------------------------------------------------------------- registry

// Fixed order: the tool list is part of the cached prompt prefix.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous inputs, validated by each tool's own schema in runTool
const ALL: Tool<any>[] = [searchHotelsTool, hotelDetailsTool, roomRatesTool, openCheckoutTool, listTripsTool, submitCheckinTool, createRequestTool];

export type ToolsKind = "anon" | "user";

export function toolsFor(kind: ToolsKind): BetaTool[] {
  return ALL.filter((t) => kind === "user" || t.access === "public").map((t) => t.definition);
}

export function toolLabel(name: string): string {
  return ALL.find((t) => t.definition.name === name)?.label ?? "Працюю…";
}

/** Runs one tool call: unknown/forbidden tools and invalid input become is_error results, never exceptions. */
export async function runTool(name: string, input: unknown, ctx: ToolCtx, kind: ToolsKind): Promise<ToolOutput> {
  const tool = ALL.find((t) => t.definition.name === name);
  if (!tool || (tool.access === "user" && (kind !== "user" || !ctx.userId))) return fail(tool ? "sign_in_required: ask the guest to sign in." : "unknown_tool");
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) return fail(`invalid_arguments: ${parsed.error.issues.map((x) => x.path.join(".") || "input").join(", ")}`);
  try {
    return await tool.run(parsed.data, ctx);
  } catch {
    return fail("internal_error: the tool failed; apologise and suggest trying again.");
  }
}
