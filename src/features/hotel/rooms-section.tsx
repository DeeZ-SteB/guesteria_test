import { getCurrentUser } from "@/server/auth";
import type { Stay } from "@/lib/booking/stay";
import { loadRates } from "./data";
import { RoomsView } from "./rooms-view";
import { HotelError } from "./hotel-error";

export async function RoomsSection({ hotelId, hotelName, stay, cityId }: { hotelId: string; hotelName: string; stay: Stay; cityId: string | null }) {
  const [rates, user] = await Promise.all([
    loadRates(hotelId, stay.checkIn, stay.checkOut, stay.adults),
    getCurrentUser().catch(() => null),
  ]);
  if ("error" in rates) {
    if (rates.error === "no_availability") return <RoomsView offers={[]} hotelId={hotelId} hotelName={hotelName} stay={stay} signedIn={!!user} cityId={cityId} />;
    return <HotelError kind={rates.error} title="Не вдалося отримати ціни" />;
  }
  return <RoomsView offers={rates.offers} hotelId={hotelId} hotelName={hotelName} stay={stay} signedIn={!!user} cityId={cityId} />;
}
