import type { HotelDetails, HotelSummary, RateOption, Review, Room, RoomOffer } from "@/lib/hotels/types";
import type { Money } from "@/lib/money";
import { roundMoney } from "@/lib/money";
import { boardLabel } from "@/lib/board";
import { parseCancelTime } from "@/lib/cancellation";
import { htmlToParagraphs } from "@/lib/text/html-to-text";
import type {
  HotelDetailsResponse,
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
  const byHotel = new Map(rates.data.map((r) => [r.hotelId, r]));
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
        netPrice: money(rate.price, currency),
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
            pros: r.pros || null,
            cons: r.cons || null,
          },
        ]
      : [],
  );
}

/** Free-cancellation deadline = earliest moment a penalty applies. */
function cancellationOf(rate: RateResponse, now: Date) {
  const policy = rate.cancellationPolicies;
  if (!policy || policy.refundableTag !== "RFN") {
    return { refundable: false, freeCancellationUntil: null, penalty: null };
  }
  const penalties = (policy.cancelPolicyInfos ?? [])
    .filter((p) => p.amount > 0)
    .map((p) => ({ at: parseCancelTime(p.cancelTime, p.timezone), amount: p.amount, currency: p.currency }))
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const first = penalties[0];
  // A deadline we cannot date, or one that has passed, is not a free cancellation.
  if (first && (!first.at || new Date(first.at) <= now)) {
    return { refundable: false, freeCancellationUntil: null, penalty: money(first.amount, first.currency) };
  }
  return {
    refundable: true,
    freeCancellationUntil: first?.at ?? null,
    penalty: first ? money(first.amount, first.currency) : null,
  };
}

function toRateOption(
  roomType: RatesResponse["data"][number]["roomTypes"][number],
  now: Date,
): RateOption {
  const rate = roomType.rates[0];
  const net = roomType.offerRetailRate;
  const suggested = roomType.suggestedSellingPrice ?? rate.retailRate.suggestedSellingPrice[0] ?? null;
  const publicAmount = Math.max(net.amount, suggested?.amount ?? 0);
  return {
    offerId: roomType.offerId,
    boardCode: rate.boardType,
    boardLabel: boardLabel(rate.boardType, rate.boardName),
    ...cancellationOf(rate, now),
    price: money(publicAmount, net.currency),
    netPrice: money(net.amount, net.currency),
    payAtHotel: (rate.retailRate.taxesAndFees ?? [])
      .filter((fee) => !fee.included && fee.amount > 0)
      .map((fee) => ({
        label: FEE_LABELS[fee.description.trim().toLowerCase()] ?? fee.description,
        amount: money(fee.amount, fee.currency),
      })),
  };
}

/**
 * Groups offers by the static room LiteAPI mapped them to (falls back to the rate name),
 * attaches room photos and size, sorts rates and rooms by price.
 */
export function toRoomOffers(rates: RatesResponse, rooms: Room[], now: Date = new Date()): RoomOffer[] {
  const roomsById = new Map(rooms.map((r) => [r.id, r]));
  const groups = new Map<string, RoomOffer>();

  for (const roomType of rates.data[0]?.roomTypes ?? []) {
    const rate = roomType.rates[0];
    const room = rate.mappedRoomId != null ? (roomsById.get(rate.mappedRoomId) ?? null) : null;
    const key = room ? `room:${room.id}` : `name:${rate.name.trim().toLowerCase()}`;
    const group = groups.get(key) ?? { room, name: room?.name ?? rate.name, rates: [] };
    group.rates.push(toRateOption(roomType, now));
    groups.set(key, group);
  }

  const offers = [...groups.values()];
  offers.forEach((o) => o.rates.sort((a, b) => a.price.amount - b.price.amount));
  return offers.sort((a, b) => a.rates[0].price.amount - b.rates[0].price.amount);
}
