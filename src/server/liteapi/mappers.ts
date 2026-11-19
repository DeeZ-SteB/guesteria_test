import type { HotelDetails, HotelSummary, PayAtHotel, RateOption, Review, Room, RoomOffer } from "@/lib/hotels/types";
import type { CheckoutQuote, ConfirmedBooking } from "@/lib/booking/checkout";
import type { Money } from "@/lib/money";
import { roundMoney } from "@/lib/money";
import { boardLabel } from "@/lib/board";
import { parseCancelTime } from "@/lib/cancellation";
import { htmlToParagraphs } from "@/lib/text/html-to-text";
import { offerIdSchema } from "@/lib/booking/offer";
import { LiteApiError } from "./errors";
import type {
  CancelBookingResponse,
  BookingData,
  HotelDetailsResponse,
  PrebookResponse,
  HotelListResponse,
  MinRatesResponse,
  RateResponse,
  RatesResponse,
  ReviewsResponse,
} from "./schemas";

const FEE_LABELS: Record<string, string> = {
  "tourism fee": "Туристичний збір",
  "city tax": "Міський податок",
  "resort fee": "Курортний збір",
  vat: "ПДВ",
};

const money = (amount: number, currency: string): Money => ({ amount: roundMoney(amount), currency });

/** "02:00 PM" → "14:00"; "14:00" stays. */
export function to24h(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** Joins the hotel list with min-rates; hotels without a price are dropped, LiteAPI order kept. */
export function toHotelSummaries(list: HotelListResponse, rates: MinRatesResponse, currency = "UAH"): HotelSummary[] {
  const byHotel = new Map(rates.data.flatMap((r) => (r ? [[r.hotelId, r] as const] : [])));
  return list.data.flatMap((hotel) => {
    const rate = hotel && byHotel.get(hotel.id);
    if (!hotel || !rate) return [];
    const publicPrice = Math.max(rate.price, rate.suggestedSellingPrice ?? 0);
    return [
      {
        id: hotel.id,
        name: hotel.name,
        stars: hotel.stars ?? null,
        rating: hotel.rating ?? null,
        reviewCount: hotel.reviewCount,
        address: hotel.address ?? null,
        photo: hotel.main_photo ?? hotel.thumbnail ?? null,
        location:
          hotel.latitude != null && hotel.longitude != null ? { lat: hotel.latitude, lng: hotel.longitude } : null,
        price: money(publicPrice, currency),
      },
    ];
  });
}

function toRoom(room: NonNullable<HotelDetailsResponse["data"]["rooms"][number]>): Room {
  return {
    id: room.id,
    name: room.roomName,
    sizeSqm: room.roomSizeSquare ?? null,
    beds: room.bedTypes.flatMap((b) => (b ? [`${b.quantity} × ${b.bedType}`] : [])),
    photos: room.photos.flatMap((p) => (p ? [p.hd_url || p.url] : [])),
  };
}

export function toHotelDetails({ data: d }: HotelDetailsResponse): HotelDetails {
  return {
    id: d.id,
    name: d.name,
    stars: d.starRating ?? null,
    rating: d.rating ?? null,
    reviewCount: d.reviewCount,
    address: d.address ?? null,
    city: d.city ?? null,
    location: d.location ? { lat: d.location.latitude, lng: d.location.longitude } : null,
    images: d.hotelImages.flatMap((img) =>
      img ? [{ url: img.url, hdUrl: img.urlHd || null, caption: img.caption || null }] : [],
    ),
    descriptionParagraphs: htmlToParagraphs(d.hotelDescription),
    importantInfo: htmlToParagraphs(d.hotelImportantInformation),
    checkIn: to24h(d.policyAttributes?.checkIn?.from) ?? to24h(d.checkinCheckoutTimes?.checkin_start),
    checkOut: to24h(d.policyAttributes?.checkOut?.until) ?? to24h(d.checkinCheckoutTimes?.checkout),
    facilities: d.hotelFacilities,
    rooms: d.rooms.flatMap((room) => (room ? [toRoom(room)] : [])),
    pros: d.sentiment_analysis?.pros ?? [],
    cons: d.sentiment_analysis?.cons ?? [],
  };
}

export function toReviews({ data }: ReviewsResponse): Review[] {
  return data.flatMap((r) =>
    r
      ? [
          {
            id: String(r.reviewId),
            score: r.averageScore ?? null,
            name: r.name,
            country: r.country ?? null,
            type: r.type ?? null,
            date: r.date ?? null,
            headline: r.headline || null,
            language: r.language || null,
            pros: r.pros || null,
            cons: r.cons || null,
          },
        ]
      : [],
  );
}

const NOT_REFUNDABLE = { refundable: false, freeCancellationUntil: null, penalty: null } as const;

/**
 * Free-cancellation deadline = earliest moment a penalty applies.
 * Conservative: if any policy entry is unreadable or undatable, we promise nothing.
 */
function cancellationOf(rate: RateResponse, now: Date) {
  const policy = rate.cancellationPolicies;
  if (!policy || policy.refundableTag !== "RFN") return NOT_REFUNDABLE;
  const infos = policy.cancelPolicyInfos ?? [];
  if (infos.some((info) => info === null)) return NOT_REFUNDABLE;

  const penalties = infos
    .flatMap((p) => (p && p.amount > 0 ? [p] : []))
    .map((p) => ({ ...p, at: parseCancelTime(p.cancelTime, p.timezone) }));
  if (penalties.some((p) => p.at === null)) return NOT_REFUNDABLE;
  if (penalties.length === 0) return { refundable: true, freeCancellationUntil: null, penalty: null };

  const first = penalties.sort((a, b) => a.at!.localeCompare(b.at!))[0];
  if (new Date(first.at!) <= now) return NOT_REFUNDABLE;
  return {
    refundable: true,
    freeCancellationUntil: first.at,
    // Only a fixed amount can be shown as hryvnias; percent/nights penalties are not.
    penalty: first.type === "amount" || first.type == null ? money(first.amount, first.currency) : null,
  };
}

/** Public price rule (stage 2): never below LiteAPI's suggested selling price, same currency only. */
export function publicPrice(net: Money, suggested: Money | null | undefined): Money {
  const suggestedAmount = suggested && suggested.currency === net.currency ? suggested.amount : 0;
  return money(Math.max(net.amount, suggestedAmount), net.currency);
}

function payAtHotelOf(rate: RateResponse): PayAtHotel[] {
  return (rate.retailRate.taxesAndFees ?? [])
    .flatMap((fee) => (fee && !fee.included && fee.amount > 0 ? [fee] : []))
    .map((fee) => ({
      label: FEE_LABELS[fee.description.trim().toLowerCase()] ?? fee.description,
      amount: money(fee.amount, fee.currency),
    }));
}

function toRateOption(
  roomType: RatesResponse["data"][number]["roomTypes"][number],
  now: Date,
): RateOption {
  const rate = roomType.rates[0];
  const net = roomType.offerRetailRate;
  return {
    offerId: roomType.offerId,
    boardCode: rate.boardType ?? null,
    boardLabel: boardLabel(rate.boardType, rate.boardName),
    ...cancellationOf(rate, now),
    price: publicPrice(net, roomType.suggestedSellingPrice ?? rate.retailRate.suggestedSellingPrice[0]),
    payAtHotel: payAtHotelOf(rate),
  };
}



/**
 * Quote for the checkout page, from prebook only. We sell one room per booking, so anything
 * else is treated as an upstream surprise rather than guessed at.
 */
export function toCheckoutQuote({ data: p }: PrebookResponse, now: Date = new Date()): CheckoutQuote {
  const rates = p.roomTypes.flatMap((t) => t.rates);
  // Deterministic shape we don't sell (multi-room): an "offer" problem, not worth retrying.
  if (rates.length !== 1) throw new LiteApiError("invalid_request", "POST /rates/prebook");
  const rate = rates[0];
  const net = rate.retailRate.total[0] ?? { amount: p.price, currency: p.currency };
  const suggested = p.suggestedSellingPrice != null ? { amount: p.suggestedSellingPrice, currency: p.currency } : rate.retailRate.suggestedSellingPrice[0];
  return {
    prebookId: p.prebookId,
    hotelId: p.hotelId,
    checkIn: p.checkin,
    checkOut: p.checkout,
    adults: rate.adultCount,
    occupancyNumber: rate.occupancyNumber,
    roomName: rate.name.trim() || "Номер",
    boardCode: rate.boardType ?? null,
    boardLabel: boardLabel(rate.boardType, rate.boardName),
    ...cancellationOf(rate, now),
    price: publicPrice({ amount: net.currency === p.currency ? Math.max(net.amount, p.price) : net.amount, currency: net.currency }, suggested),
    payAtHotel: payAtHotelOf(rate),
    changes: {
      price: (p.priceDifferencePercent ?? 0) !== 0,
      cancellation: p.cancellationChanged === true,
      board: p.boardChanged === true,
    },
  };
}

/** Normalises a book / get-booking response. Room and board come from the prebook, not from here. */
export function toConfirmedBooking(b: BookingData): ConfirmedBooking {
  const policy = b.cancellationPolicies;
  const status = b.status.toUpperCase();
  let refundable: boolean | null = null;
  let refundableUntil: string | null = null;
  if (policy?.refundableTag === "NRFN") refundable = false;
  else if (policy?.refundableTag === "RFN") {
    const deadlines: Array<string | null> = [];
    for (const info of policy.cancelPolicyInfos ?? []) {
      if (info === null) deadlines.push(null);
      else if (info.amount > 0) deadlines.push(parseCancelTime(info.cancelTime, info.timezone));
    }
    if (b.lastFreeCancellationDate) {
      const t = Date.parse(b.lastFreeCancellationDate);
      deadlines.push(Number.isNaN(t) ? null : new Date(t).toISOString());
    }
    // Unreadable entries → unknown (null), never an invented deadline.
    if (!deadlines.some((d) => d === null)) {
      refundable = true;
      refundableUntil = (deadlines as string[]).sort()[0] ?? null;
    }
  }
  return {
    liteapiBookingId: b.bookingId,
    clientReference: b.clientReference ?? null,
    prebookId: b.prebookId ?? null,
    hotelId: b.hotelId ?? b.hotel?.hotelId ?? null,
    checkIn: b.checkin,
    checkOut: b.checkout,
    status,
    confirmed: status === "CONFIRMED",
    refundable,
    refundableUntil,
  };
}

/**
 * Groups offers by the static room LiteAPI mapped them to (falls back to the rate name),
 * attaches room photos and size, sorts rates and rooms by price.
 */
export function toRoomOffers(rates: RatesResponse, rooms: Room[], now: Date = new Date()): RoomOffer[] {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const roomsByName = new Map(rooms.map((r) => [r.name.trim().toLowerCase(), r]));
  const groups = new Map<string, RoomOffer>();

  for (const roomType of rates.data[0]?.roomTypes ?? []) {
    // A rate whose token can't be handed to checkout would make «Обрати» do nothing: drop it.
    if (!offerIdSchema.safeParse(roomType.offerId).success) continue;
    const rate = roomType.rates[0];
    // Prefer LiteAPI's mapping; if the id is unknown, fall back to a room with the same name
    // so one room never shows up as two cards.
    const room =
      (rate.mappedRoomId != null ? roomsById.get(rate.mappedRoomId) : undefined) ??
      roomsByName.get(rate.name.trim().toLowerCase()) ??
      null;
    const key = room ? `room:${room.id}` : `name:${rate.name.trim().toLowerCase()}`;
    const group = groups.get(key) ?? { room, name: room?.name ?? rate.name, rates: [] };
    group.rates.push(toRateOption(roomType, now));
    groups.set(key, group);
  }

  const offers = [...groups.values()];
  offers.forEach((o) => o.rates.sort((a, b) => a.price.amount - b.price.amount));
  return offers.sort((a, b) => a.rates[0].price.amount - b.rates[0].price.amount);
}

/** LiteAPI booking status → what reconciliation needs. */
export function toBookingState(status: string | null | undefined): "confirmed" | "cancelled" | "other" {
  const s = (status ?? "").toUpperCase();
  if (s.startsWith("CANCEL")) return "cancelled";
  if (s === "CONFIRMED") return "confirmed";
  return "other";
}

export type CancelOutcome = { status: "cancelled" | "cancelled_with_charges"; charged: boolean };

/**
 * What a cancel did. LiteAPI's refund_amount is OUR net cost, never shown to the guest; only
 * whether a fee applied is kept (for logging and support).
 */
export function toCancelOutcome(d: CancelBookingResponse["data"]): CancelOutcome {
  const withCharges = d.status.endsWith("WITH_CHARGES");
  return { status: withCharges ? "cancelled_with_charges" : "cancelled", charged: withCharges || (d.cancellation_fee ?? 0) > 0 };
}
