import { cache } from "react";
import Link from "next/link";
import { navigation } from "next/cache";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarCheck, FlaskConical, Info, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getHotel, LiteApiError, prebookOffer } from "@/server/liteapi";
import { findSameStay, getOwnBooking } from "@/server/bookings";
import { hitAll } from "@/server/rate-limit";
import { signCheckoutToken } from "@/server/checkout/token";
import { nightsBetween, todayInKyiv } from "@/lib/booking/stay";
import { priceChange, type CheckoutQuote } from "@/lib/booking/checkout";
import { cancellationText } from "@/lib/cancellation";
import { formatMoney } from "@/lib/money";
import { adultsLabel, formatShortDate, nightsLabel } from "@/lib/format";
import { payAtHotelText } from "@/lib/hotels/rates";
import { isAllowedImageUrl } from "@/lib/hotels/images";
import { hotelHref, parseCheckoutParams } from "@/lib/search/params";
import { findCity, findCityByLiteApiName } from "@/lib/cities";
import type { HotelDetails } from "@/lib/hotels/types";
import { HotelImage } from "@/components/ui/hotel-image";
import { Stars } from "@/components/ui/rating";
import { CheckoutError, type CheckoutPageError } from "./checkout-error";
import { GuestForm } from "./guest-form";
import { SuccessView } from "./success-view";
import { resolveForView } from "./resolve";

type Raw = Record<string, string | string[] | undefined>;

/** One prebook per request (React.cache), never on prefetch (navigation()). */
const quoteFor = cache(async (offerId: string): Promise<CheckoutQuote | { error: CheckoutPageError }> => {
  try {
    return await prebookOffer(offerId);
  } catch (error) {
    const kind = error instanceof LiteApiError ? error.kind : "unknown";
    if (kind === "no_availability") return { error: "rate_gone" };
    if (kind === "invalid_request") return { error: "offer_stale" };
    return { error: "retry" };
  }
});

const currentPath = (raw: Raw) => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);
  return `/checkout?${params}`;
};

export async function CheckoutContent({ searchParams }: { searchParams: PageProps<"/checkout">["searchParams"] }) {
  const raw = (await searchParams) as Raw;
  await connection();

  // ---- success state: /checkout?booking=<our uuid> ----
  const bookingId = typeof raw.booking === "string" ? raw.booking : null;
  if (bookingId !== null) {
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) notFound();
    const user = await requireUser(`/checkout?booking=${bookingId}`);
    const booking = await getOwnBooking(user.id, bookingId);
    if (!booking) notFound();
    const state = await resolveForView(booking);
    // Re-read after a resolution so the page shows what is stored now.
    const current = state === "confirmed" && booking.status !== "confirmed" ? ((await getOwnBooking(user.id, bookingId)) ?? booking) : booking;
    return <SuccessView booking={current} state={state} />;
  }

  const today = todayInKyiv();
  const params = parseCheckoutParams(raw, today);
  if (params.status === "invalid") return <CheckoutError kind="invalid" backHref={params.backHref} />;
  const user = await requireUser(currentPath(raw));
  const back = hotelHref(params.hotelId, { ...params.stay, cityId: params.cityId });

  // Below this line runs only on a real navigation, not on link prefetch.
  await navigation();
  // Prebook costs a supplier call: per user and overall caps (SPEC §17, stage 8).
  const allowed = await hitAll([
    ["prebookUser", user.id],
    ["prebookAll", "all"],
  ]);
  if (!allowed.allowed) return <CheckoutError kind="rate_limited" backHref={back} />;
  const quote = await quoteFor(params.offerId);
  if ("error" in quote) return <CheckoutError kind={quote.error} backHref={back} hotelId={params.hotelId} />;

  // The URL is only a pointer: prebook must describe the same hotel and stay.
  const s = params.stay;
  if (quote.hotelId !== params.hotelId || quote.checkIn !== s.checkIn || quote.checkOut !== s.checkOut || quote.adults !== s.adults) {
    return <CheckoutError kind="mismatch" backHref={back} hotelId={params.hotelId} />;
  }

  const [hotel, sameStay] = await Promise.all([
    getHotel(quote.hotelId).catch((): HotelDetails | null => null),
    findSameStay(user.id, quote.hotelId, quote.checkIn, quote.checkOut).catch(() => null),
  ]);
  const hotelName = hotel?.name || "Готель";
  const image = hotel?.images.find((i) => isAllowedImageUrl(i.url) && i.url.length <= 500)?.url ?? null;
  const city = findCity(params.cityId ?? "") ?? findCityByLiteApiName(hotel?.city);

  const token = signCheckoutToken({
    uid: user.id,
    pid: quote.prebookId,
    hid: quote.hotelId,
    ci: quote.checkIn,
    co: quote.checkOut,
    ad: quote.adults,
    occ: quote.occupancyNumber,
    amt: quote.price.amount,
    cur: quote.price.currency,
    room: quote.roomName.slice(0, 200),
    board: quote.boardCode && /^[A-Z0-9]{1,8}$/.test(quote.boardCode) ? quote.boardCode : null,
    city: city?.id ?? null,
    img: image,
    name: hotelName.slice(0, 200),
    rf: quote.refundable,
    until: quote.freeCancellationUntil,
  });
  if (!token) return <CheckoutError kind="offer_stale" backHref={back} hotelId={params.hotelId} />;

  const nights = nightsBetween(quote.checkIn, quote.checkOut);
  const change = priceChange(quote, params.shownPrice);
  const fees = payAtHotelText(quote.payAtHotel);
  const cancellation = cancellationText(quote);
  const free = cancellation.startsWith("Безкоштовне");

  const summary = (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="relative h-36 bg-line">
        <HotelImage src={image} alt="" sizes="(min-width:1024px) 360px, 100vw" />
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div>
          <Stars count={hotel?.stars ?? null} />
          <p className="text-base font-bold">{hotelName}</p>
          {hotel?.address && <p className="text-muted">{hotel.address}</p>}
        </div>
        <p className="font-medium">{quote.roomName}</p>
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-button bg-bg p-2">
            <dt className="text-xs text-muted">Заїзд</dt>
            <dd>{formatShortDate(quote.checkIn)}{hotel?.checkIn ? ` · з ${hotel.checkIn}` : ""}</dd>
          </div>
          <div className="rounded-button bg-bg p-2">
            <dt className="text-xs text-muted">Виїзд</dt>
            <dd>{formatShortDate(quote.checkOut)}{hotel?.checkOut ? ` · до ${hotel.checkOut}` : ""}</dd>
          </div>
        </dl>
        <p className="text-muted">
          {nightsLabel(nights)} · {adultsLabel(quote.adults)} · {quote.boardLabel}
        </p>
        <div className="space-y-1.5 border-t border-line pt-3">
          <div className="flex justify-between text-base font-bold">
            <span>Разом</span>
            <span>{formatMoney(quote.price)}</span>
          </div>
          <p className="text-xs text-muted">Податки включено{fees ? `. ${fees.replace(/^\+ /, "Окремо: ")}` : ""}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-4 md:px-8 md:py-8">
      <ol className="mb-6 hidden items-center gap-3 text-sm md:flex" aria-label="Кроки бронювання">
        <li className="flex items-center gap-2 font-medium text-success-ink">
          <span className="grid size-6 place-items-center rounded-full bg-success text-xs text-white">✓</span>Вибір номера
        </li>
        <li aria-hidden className="h-px flex-1 bg-line" />
        <li className="flex items-center gap-2 font-semibold" aria-current="step">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-xs text-on-primary">2</span>Ваші дані
        </li>
        <li aria-hidden className="h-px flex-1 bg-line" />
        <li className="flex items-center gap-2 text-muted">
          <span className="grid size-6 place-items-center rounded-full border border-line text-xs">3</span>Підтвердження
        </li>
      </ol>
      <h1 className="mb-4 text-title font-bold md:sr-only">Оформлення</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start lg:gap-8">
        <div className="space-y-4">
          {sameStay && (
            <p className="flex gap-2 rounded-button border border-accent/40 bg-accent/10 p-3 text-sm" role="status">
              <CalendarCheck className="size-5 shrink-0 text-accent-ink" aria-hidden />
              <span>
                {sameStay.status === "pending"
                  ? "У вас є незавершене бронювання в цьому готелі на ці дати — перевірте його, перш ніж бронювати знову."
                  : "У вас уже є бронювання в цьому готелі на ці дати."}{" "}
                <Link href={`/checkout?booking=${sameStay.id}`} className="font-medium text-primary underline">
                  Переглянути
                </Link>
              </span>
            </p>
          )}
          {change && (
            <p className="flex gap-2 rounded-button border border-accent/40 bg-accent/10 p-3 text-sm" role="status">
              <Info className="size-5 shrink-0 text-accent-ink" aria-hidden />
              <span>
                Ціна змінилася: було <s>{formatMoney({ amount: change.from, currency: quote.price.currency })}</s>, стало{" "}
                <b>{formatMoney(quote.price)}</b>.
              </span>
            </p>
          )}
          {(quote.changes.cancellation || quote.changes.board) && (
            <p className="flex gap-2 rounded-button border border-accent/40 bg-accent/10 p-3 text-sm" role="status">
              <AlertTriangle className="size-5 shrink-0 text-accent-ink" aria-hidden />
              {[quote.changes.cancellation && "Умови скасування змінилися", quote.changes.board && "Харчування змінилося"].filter(Boolean).join(". ")}.
              Перевірте деталі нижче.
            </p>
          )}

          <div className="lg:hidden">{summary}</div>

          <section className="rounded-card border border-line bg-surface p-4 text-sm md:p-5" aria-labelledby="terms-title">
            <h2 id="terms-title" className="mb-2 text-base font-bold">
              Умови
            </h2>
            <p className={`flex items-center gap-1.5 font-medium ${free ? "text-success-ink" : "text-danger"}`}>
              <ShieldCheck className="size-4" aria-hidden />
              {cancellation}
            </p>
            {quote.penalty && free && <p className="mt-1 text-muted">Після цієї дати — штраф {formatMoney(quote.penalty)}.</p>}
            {fees && <p className="mt-1 text-muted">{fees}</p>}
          </section>

          <GuestForm
            token={token}
            total={formatMoney(quote.price)}
            initial={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
          />

          <p className="flex gap-1.5 text-xs text-muted">
            <FlaskConical className="size-4 shrink-0" aria-hidden />
            Тестове бронювання в sandbox LiteAPI — кошти не списуються.
          </p>
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Ваше бронювання">
          {summary}
        </aside>
      </div>
    </div>
  );
}
