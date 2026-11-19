import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { getHotel, hotelIdSchema, LiteApiError } from "@/server/liteapi";
import { getCurrentUser } from "@/server/auth";
import { getFavoriteHotelIds } from "@/server/favorites";
import type { HotelDetails } from "@/lib/hotels/types";
import type { LiteApiErrorKind } from "@/lib/liteapi-messages";
import { defaultStay, todayInKyiv } from "@/lib/booking/stay";
import { findCity, findCityByLiteApiName } from "@/lib/cities";
import { galleryImages, mapsHref } from "@/lib/hotels/page";
import { hotelStayState, searchHref, stayKey } from "@/lib/search/params";
import { RatingSummary, Stars } from "@/components/ui/rating";
import { Skeleton } from "@/components/ui/feedback";
import { Gallery } from "./gallery";
import { HotelActions } from "./hotel-actions";
import { Facilities } from "./facilities";
import { Description } from "./description";
import { StayForm } from "./stay-form";
import { RoomsSection } from "./rooms-section";
import { BookingBarSkeleton, BookingSummary } from "./booking-summary";
import { ReviewsSection } from "./reviews-section";
import { HotelError } from "./hotel-error";
import { AskAiButton } from "./ask-ai";
import { AssistantPageContext } from "@/components/shell/assistant-fab";
import { RoomsSkeleton } from "./hotel-skeleton";

type Props = Pick<PageProps<"/hotels/[hotelId]">, "params" | "searchParams">;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function loadHotel(id: string): Promise<{ hotel: HotelDetails } | { error: LiteApiErrorKind }> {
  try {
    return { hotel: await getHotel(id) };
  } catch (error) {
    return { error: error instanceof LiteApiError ? error.kind : "unknown" };
  }
}

export async function HotelPage({ params, searchParams }: Props) {
  const [{ hotelId }, raw] = await Promise.all([params, searchParams]);
  await connection(); // "today" depends on request time
  const today = todayInKyiv();

  if (!hotelIdSchema.safeParse(hotelId).success) notFound();
  const loaded = await loadHotel(hotelId);
  // LiteAPI answers 400/4002 for an unknown hotel id (probed) → our invalid_request → 404.
  if ("error" in loaded) {
    if (loaded.error === "invalid_request") notFound();
    return <HotelError kind={loaded.error} />;
  }
  const { hotel } = loaded;

  const city = findCity(first(raw.city)) ?? findCityByLiteApiName(hotel.city);
  const stayState = hotelStayState(raw, today);

  const backStay = stayState.status === "ok" ? stayState.stay : defaultStay(today);
  const backHref = city ? searchHref({ cityId: city.id, ...backStay }) : "/";
  const images = galleryImages(hotel.images);
  const maps = mapsHref(hotel.location);

  return (
    <div className="mx-auto max-w-[1200px] md:px-8 md:py-6">
      <Link href={backHref} className="hidden min-h-11 items-center gap-1 text-sm text-muted hover:text-primary md:inline-flex">
        <ChevronLeft className="size-4" aria-hidden />
        {city ? `Готелі: ${city.nameUk}` : "До пошуку"}
      </Link>

      <Gallery images={images} hotelName={hotel.name} backHref={backHref} />

      <div className="grid gap-6 lg:mt-6 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0 space-y-2 md:space-y-6">
          <section className="bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Stars count={hotel.stars} />
                <h1 className="mt-1 text-title font-bold md:text-headline">{hotel.name}</h1>
                {hotel.address && (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {hotel.address}
                      {hotel.city ? `, ${city?.nameUk ?? hotel.city}` : ""}
                    </span>
                    {maps && (
                      <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-primary">
                        Маршрут ↗
                      </a>
                    )}
                  </p>
                )}
              </div>
              <Suspense fallback={<Skeleton className="size-11 rounded-full" />}>
                <FavoriteSlot hotel={hotel} cityId={city?.id ?? null} />
              </Suspense>
            </div>
            <div className="mt-3">
              <RatingSummary rating={hotel.rating} reviewCount={hotel.reviewCount} />
            </div>
            <div className="mt-4 lg:hidden">
              <AskAiButton hotelId={hotel.id} hotelName={hotel.name} />
            </div>
            <AssistantPageContext
              value={{
                page: "hotel",
                hotelId: hotel.id,
                hotelName: hotel.name,
                ...(stayState.status === "ok" ? { checkin: stayState.stay.checkIn, checkout: stayState.stay.checkOut, adults: stayState.stay.adults } : {}),
              }}
            />
          </section>

          <Facilities facilities={hotel.facilities} />

          <section className="bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6" aria-labelledby="about-title">
            <h2 id="about-title" className="mb-2 text-lg font-semibold">
              Про готель
            </h2>
            <Description paragraphs={hotel.descriptionParagraphs} />
            {(hotel.checkIn || hotel.checkOut) && (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-button bg-bg p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3.5" aria-hidden />
                    Заїзд
                  </dt>
                  <dd className="font-medium">{hotel.checkIn ? `з ${hotel.checkIn}` : "уточнюйте"}</dd>
                </div>
                <div className="rounded-button bg-bg p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3.5" aria-hidden />
                    Виїзд
                  </dt>
                  <dd className="font-medium">{hotel.checkOut ? `до ${hotel.checkOut}` : "уточнюйте"}</dd>
                </div>
              </dl>
            )}
            {hotel.importantInfo.length > 0 && (
              <details className="mt-4 text-sm">
                <summary className="min-h-11 cursor-pointer content-center font-medium text-primary">Важлива інформація від готелю</summary>
                <div className="mt-2 space-y-2 text-muted">
                  {hotel.importantInfo.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </details>
            )}
          </section>

          {(hotel.pros.length > 0 || hotel.cons.length > 0) && (
            <section className="bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6" aria-labelledby="sentiment-title">
              <h2 id="sentiment-title" className="mb-3 text-lg font-semibold">
                Що кажуть гості
              </h2>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                {hotel.pros.length > 0 && (
                  <ul className="space-y-1.5">
                    {hotel.pros.map((p) => (
                      <li key={p} className="flex gap-2">
                        <ThumbsUp className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {hotel.cons.length > 0 && (
                  <ul className="space-y-1.5">
                    {hotel.cons.map((p) => (
                      <li key={p} className="flex gap-2">
                        <ThumbsDown className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">За аналізом відгуків, мовою оригіналу.</p>
            </section>
          )}

          <section id="rooms" className="scroll-mt-20 bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6" aria-labelledby="rooms-title">
            <h2 id="rooms-title" className="text-lg font-semibold">
              Номери й ціни
            </h2>
            <div className="mt-3">
              <StayForm
                key={JSON.stringify(stayState)}
                hotelId={hotel.id}
                cityId={city?.id ?? null}
                today={today}
                initial={stayState.status === "ok" ? { checkIn: stayState.stay.checkIn, checkOut: stayState.stay.checkOut, adults: String(stayState.stay.adults) } : stayState.values}
                errors={stayState.status === "invalid" ? stayState.errors : {}}
              />
            </div>
            <div className="mt-4">
              {stayState.status === "ok" ? (
                <Suspense key={stayKey(stayState.stay)} fallback={<RoomsSkeleton />}>
                  <RoomsSection hotelId={hotel.id} hotelName={hotel.name} stay={stayState.stay} cityId={city?.id ?? null} />
                </Suspense>
              ) : (
                <p className="rounded-button bg-primary-soft p-4 text-sm text-primary-dark">
                  {stayState.status === "invalid" ? "Виправте дати вище, щоб побачити ціни." : "Оберіть дати поїздки, щоб побачити вільні номери й ціни."}
                </p>
              )}
            </div>
          </section>

          <Suspense fallback={<Skeleton className="h-40 md:rounded-card" />}>
            <ReviewsSection hotelId={hotel.id} rating={hotel.rating} reviewCount={hotel.reviewCount} />
          </Suspense>
        </div>

        <aside className="hidden lg:block" aria-label="Бронювання">
          <div className="sticky top-24 space-y-3">
            {stayState.status === "ok" ? (
              <Suspense key={stayKey(stayState.stay)} fallback={<Skeleton className="h-56 rounded-card" />}>
                <BookingSummary hotel={hotel} stay={stayState.stay} variant="card" />
              </Suspense>
            ) : (
              <BookingSummary hotel={hotel} stay={null} variant="card" />
            )}
            <div data-ai-inline className="rounded-card bg-primary-soft p-4 text-sm">
              <p className="font-semibold text-primary-dark">Питання про готель?</p>
              <p className="mt-1 text-xs text-primary-dark">Guesteria AI знає правила, зручності й відгуки гостей.</p>
              <div className="mt-3">
                <AskAiButton hotelId={hotel.id} hotelName={hotel.name} compact />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Phones and tablets: sticky bar with the cheapest price. */}
      {stayState.status === "ok" ? (
        <Suspense key={stayKey(stayState.stay)} fallback={<BookingBarSkeleton />}>
          <BookingSummary hotel={hotel} stay={stayState.stay} variant="bar" />
        </Suspense>
      ) : (
        <BookingSummary hotel={hotel} stay={null} variant="bar" />
      )}
    </div>
  );
}

async function FavoriteSlot({ hotel, cityId }: { hotel: HotelDetails; cityId: string | null }) {
  const user = await getCurrentUser().catch(() => null);
  const favoriteIds = user ? await getFavoriteHotelIds([hotel.id]) : [];
  return (
    <HotelActions
      key={`${!!user}:${favoriteIds.join()}`}
      target={{ id: hotel.id, name: hotel.name, photo: hotel.images[0]?.url ?? null }}
      favoriteIds={favoriteIds}
      signedIn={!!user}
      cityId={cityId}
    />
  );
}
