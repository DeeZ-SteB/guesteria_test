import "server-only";
import type { HotelSummary, Room, RoomOffer } from "@/lib/hotels/types";
import type { Stay } from "@/lib/booking/stay";
import type { LiteApiClient } from "./client";
import { LiteApiError } from "./errors";
import { toHotelSummaries, toRoomOffers } from "./mappers";
import type { HotelListResponse } from "./schemas";

/** Uncached compositions. Take the client as an argument so tests can inject a fake fetch. */

export async function searchHotels(
  client: LiteApiClient,
  { hotels, stay }: { hotels: HotelListResponse; stay: Stay },
): Promise<HotelSummary[]> {
  const hotelIds = hotels.data.flatMap((h) => (h ? [h.id] : []));
  if (hotelIds.length === 0) return [];
  try {
    const rates = await client.getMinRates({
      hotelIds,
      checkin: stay.checkIn,
      checkout: stay.checkOut,
      occupancies: [{ adults: stay.adults }],
    });
    return toHotelSummaries(hotels, rates);
  } catch (error) {
    if (error instanceof LiteApiError && error.kind === "no_availability") return [];
    throw error;
  }
}

export async function getRoomRates(
  client: LiteApiClient,
  { hotelId, stay, rooms, now }: { hotelId: string; stay: Stay; rooms: Room[]; now?: Date },
): Promise<RoomOffer[]> {
  try {
    const rates = await client.getRates({
      hotelIds: [hotelId],
      checkin: stay.checkIn,
      checkout: stay.checkOut,
      occupancies: [{ adults: stay.adults }],
    });
    return toRoomOffers(rates, rooms, now);
  } catch (error) {
    if (error instanceof LiteApiError && error.kind === "no_availability") return [];
    throw error;
  }
}
