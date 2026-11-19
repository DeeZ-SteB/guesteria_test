import { cache } from "react";
import { MapPin, Navigation, Info } from "lucide-react";
import { getHotel } from "@/server/liteapi";
import type { HotelDetails } from "@/lib/hotels/types";
import { mapsUrl } from "@/lib/booking/trip-page";
import { Skeleton } from "@/components/ui/feedback";

/** One LiteAPI call per request for all blocks (getHotel itself is "use cache"). Failure → null. */
export const getTripHotel = cache(async (hotelId: string): Promise<HotelDetails | null> => {
  try {
    return await getHotel(hotelId);
  } catch {
    return null;
  }
});

/** Block 3: how to get there. Works without LiteAPI (search link by name and city). */
export async function TripDirections({ hotelId, hotelName, cityName }: { hotelId: string; hotelName: string; cityName: string | null }) {
  const hotel = await getTripHotel(hotelId);
  const address = hotel?.address ?? null;
  const query = [hotelName, address ?? cityName].filter(Boolean).join(", ");
  return (
    <section aria-labelledby="directions-title" className="rounded-card border border-line bg-surface p-4 md:p-5">
      <h2 id="directions-title" className="mb-2 flex items-center gap-2 text-base font-bold">
        <MapPin className="size-4 text-primary" aria-hidden />
        Як дістатися
      </h2>
      <p className="text-sm">{address ?? cityName ?? hotelName}</p>
      <a
        href={mapsUrl(hotel?.location ?? null, query)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-button border-2 border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-soft"
      >
        <Navigation className="size-4" aria-hidden />
        Маршрут
      </a>
    </section>
  );
}

/** Block 6: hotel information. */
export async function TripHotelInfo({ hotelId }: { hotelId: string }) {
  const hotel = await getTripHotel(hotelId);
  return (
    <section aria-labelledby="hotel-info-title" className="rounded-card border border-line bg-surface p-4 md:p-5">
      <h2 id="hotel-info-title" className="mb-3 flex items-center gap-2 text-base font-bold">
        <Info className="size-4 text-primary" aria-hidden />
        Про готель
      </h2>
      {!hotel ? (
        <p className="text-sm text-muted">Інформація про готель тимчасово недоступна.</p>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-button bg-bg p-2">
              <dt className="text-xs text-muted">Заселення</dt>
              <dd className="font-medium">{hotel.checkIn ? `з ${hotel.checkIn}` : "—"}</dd>
            </div>
            <div className="rounded-button bg-bg p-2">
              <dt className="text-xs text-muted">Виселення</dt>
              <dd className="font-medium">{hotel.checkOut ? `до ${hotel.checkOut}` : "—"}</dd>
            </div>
          </dl>
          {hotel.facilities.length > 0 && <Expandable title="Зручності" items={hotel.facilities} visible={8} chips />}
          {hotel.importantInfo.length > 0 && <Expandable title="Важливо знати" items={hotel.importantInfo} visible={3} />}
        </div>
      )}
    </section>
  );
}

function Expandable({ title, items, visible, chips = false }: { title: string; items: string[]; visible: number; chips?: boolean }) {
  const list = (xs: string[]) =>
    chips ? (
      <ul className="flex flex-wrap gap-1.5" role="list">
        {xs.map((f) => (
          <li key={f} className="rounded-full bg-bg px-2.5 py-1 text-xs">
            {f}
          </li>
        ))}
      </ul>
    ) : (
      <div className="space-y-2 text-muted">
        {xs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {list(items.slice(0, visible))}
      {items.length > visible && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">Показати все ({items.length})</summary>
          <div className="mt-2">{list(items.slice(visible))}</div>
        </details>
      )}
    </div>
  );
}

export function BlockSkeleton({ tall = false }: { tall?: boolean }) {
  return <Skeleton className={tall ? "h-64 rounded-card" : "h-32 rounded-card"} />;
}
