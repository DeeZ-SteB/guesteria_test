import "server-only";
import { getHotel, hotelIdSchema } from "@/server/liteapi";
import { getOwnBooking } from "@/server/bookings";
import { getCheckin, listGuestRequests } from "@/server/trip";
import { findCity } from "@/lib/cities";
import { isPastCheckIn, isTooFarAhead, staySchema, todayInKyiv } from "@/lib/booking/stay";
import { checkinEligibility, isEarlierThan, openTypes, requestTypeAvailable, tripMode } from "@/lib/booking/trip-page";
import type { PageContext } from "@/features/assistant/protocol";
import { untrustedValue } from "./untrusted";

export type TripHint = "checkin_missing" | "early_arrival";

export type ResolvedContext = {
  /** What the server verified; the only page facts the model sees. */
  page: PageContext;
  /** Short header label for the panel. */
  label: string;
  hints: TripHint[];
  facts: string[];
};

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

function stayFrom(c: { checkin?: string; checkout?: string; adults?: number }) {
  const parsed = staySchema.safeParse({ checkIn: c.checkin, checkOut: c.checkout, adults: c.adults ?? 2 });
  if (!parsed.success || isPastCheckIn(parsed.data.checkIn) || isTooFarAhead(parsed.data.checkIn)) return null;
  return parsed.data;
}

/** The trip facts and proactive hints for one booking of this user (null if not theirs / not usable). */
export async function buildTripContext(userId: string, bookingId: string, now = new Date()) {
  const booking = await getOwnBooking(userId, bookingId).catch(() => null);
  if (!booking) return null;
  const today = todayInKyiv(now);
  const stay = { status: booking.status, checkIn: booking.check_in, checkOut: booking.check_out };
  const mode = tripMode(stay, today);
  if (mode === "pending") return null;
  const [checkin, requests, hotel] = await Promise.all([
    getCheckin(userId, bookingId).catch(() => null),
    listGuestRequests(userId, bookingId).catch(() => []),
    withTimeout(getHotel(booking.hotel_id), 1500),
  ]);
  const hints: TripHint[] = [];
  if (mode === "active" && !checkin && checkinEligibility(stay, today).ok) hints.push("checkin_missing");
  if (
    mode === "active" &&
    checkin &&
    isEarlierThan(checkin.arrivalTime, hotel?.checkIn ?? null) &&
    !openTypes(requests).has("early_check_in") &&
    requestTypeAvailable("early_check_in", stay, today)
  ) {
    hints.push("early_arrival");
  }
  const open = [...openTypes(requests)];
  const facts = [
    `trip.booking_id: ${booking.id}`,
    `trip.hotel_id: ${booking.hotel_id}`,
    `trip.hotel_name: ${untrustedValue(booking.hotel_name)}`,
    `trip.dates: ${booking.check_in} → ${booking.check_out}, adults ${booking.adults}`,
    `trip.state: ${mode}`,
    `trip.hotel_check_in_time: ${hotel?.checkIn ?? "unknown"}; check_out_time: ${hotel?.checkOut ?? "unknown"}`,
    `trip.online_check_in: ${checkin ? `done, arrival ${checkin.arrivalTime}` : "not done"}`,
    `trip.open_requests: ${open.length ? open.join(", ") : "none"}`,
  ];
  if (hints.length) facts.push(`trip.suggestions_shown_to_guest: ${hints.join(", ")}`);
  return { booking, mode, hints, facts, hotelName: booking.hotel_name };
}

/** Never trusts the client: drops unknown cities/dates, checks trip ownership, loads hotel data itself. */
export async function resolveContext(input: PageContext, userId: string | null): Promise<ResolvedContext> {
  if (input.page === "search") {
    const city = input.cityId ? findCity(input.cityId) : undefined;
    const stay = stayFrom(input);
    const facts = ["page: search results"];
    if (city) facts.push(`search.city_id: ${city.id} (${city.nameUk})`);
    if (stay) facts.push(`search.dates: ${stay.checkIn} → ${stay.checkOut}, adults ${stay.adults}`);
    return { page: { page: "search", cityId: city?.id, checkin: stay?.checkIn, checkout: stay?.checkOut, adults: stay?.adults }, label: city ? `Пошук · ${city.nameUk}` : "Пошук", hints: [], facts };
  }
  if (input.page === "hotel") {
    const id = hotelIdSchema.safeParse(input.hotelId);
    if (!id.success) return other();
    const hotel = await withTimeout(getHotel(id.data), 1500);
    const stay = stayFrom(input);
    const facts = [`page: hotel`, `hotel.id: ${id.data}`];
    if (hotel) facts.push(`hotel.name: ${untrustedValue(hotel.name)}`, `hotel.check_in_time: ${hotel.checkIn ?? "unknown"}; check_out_time: ${hotel.checkOut ?? "unknown"}`);
    if (stay) facts.push(`hotel.selected_dates: ${stay.checkIn} → ${stay.checkOut}, adults ${stay.adults}`);
    return { page: { page: "hotel", hotelId: id.data, checkin: stay?.checkIn, checkout: stay?.checkOut, adults: stay?.adults }, label: hotel ? hotel.name.slice(0, 60) : "Готель", hints: [], facts };
  }
  if (input.page === "trip" && userId) {
    const trip = await buildTripContext(userId, input.bookingId);
    if (!trip) {
      console.warn("[assistant] trip context refused");
      return other();
    }
    return { page: input, label: `Поїздка · ${trip.hotelName.slice(0, 50)}`, hints: trip.hints, facts: ["page: my trip", ...trip.facts] };
  }
  return other();
}

const other = (): ResolvedContext => ({ page: { page: "other" }, label: "Guesteria AI", hints: [], facts: ["page: other"] });

/** The server-written header of every user turn. */
export function buildVerifiedContext(ctx: ResolvedContext, o: { signedIn: boolean; replyLanguage: "auto" | "uk" | "en"; today: string; decided: string[] }): string {
  const lines = [`today: ${o.today} (Europe/Kyiv)`, `reply_language: ${o.replyLanguage}`, `signed_in: ${o.signedIn ? "yes" : "no"}`, ...ctx.facts];
  if (o.decided.length) lines.push(`actions_since_last_turn: ${o.decided.join("; ")}`);
  return `<verified_context>\n${lines.join("\n")}\n</verified_context>`;
}
