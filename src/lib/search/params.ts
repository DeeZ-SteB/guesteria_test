import { z } from "zod";
import { offerIdSchema } from "@/lib/booking/offer";
import { findCity } from "@/lib/cities";
import { defaultStay, isPastCheckIn, isTooFarAhead, MAX_DAYS_AHEAD, MAX_GUESTS, staySchema, type Stay } from "@/lib/booking/stay";

export type SearchQuery = { cityId: string } & Stay;

export const SORTS = ["recommended", "price_asc", "price_desc", "rating_desc"] as const;
export type Sort = (typeof SORTS)[number];
export type ViewState = {
  sort: Sort;
  price: { min: number; max: number } | null;
  stars: number[];
  rating: 8 | 9 | null;
};
export const DEFAULT_VIEW: ViewState = { sort: "recommended", price: null, stars: [], rating: null };

export type SearchField = "city" | "checkIn" | "checkOut" | "adults";
export type FormValues = { city: string; checkIn: string; checkOut: string; adults: string };

export type ParsedSearch =
  | { status: "empty" }
  | { status: "invalid"; values: FormValues; errors: Partial<Record<SearchField, string>> }
  | { status: "ok"; query: SearchQuery; view: ViewState };

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function first(raw: RawParams, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

export type StayValues = Omit<FormValues, "city">;

/** Dates + guests only (hotel page). Same Ukrainian messages as the search form. */
export function validateStay(values: StayValues, today: string): {
  stay?: Stay;
  errors: Partial<Record<Exclude<SearchField, "city">, string>>;
} {
  const errors: Partial<Record<Exclude<SearchField, "city">, string>> = {};
  const stay = staySchema.safeParse({ checkIn: values.checkIn, checkOut: values.checkOut, adults: values.adults });
  if (!stay.success) {
    for (const issue of stay.error.issues) {
      const key = issue.path[0] as Exclude<SearchField, "city">;
      errors[key] ??=
        key === "checkIn" || key === "checkOut"
          ? issue.code === "custom"
            ? issue.message
            : "Оберіть дату"
          : `Від 1 до ${MAX_GUESTS} гостей`;
    }
    return { errors };
  }
  const noon = new Date(`${today}T12:00:00Z`);
  if (isPastCheckIn(stay.data.checkIn, noon)) errors.checkIn = "Дата заїзду не може бути в минулому";
  else if (isTooFarAhead(stay.data.checkIn, noon)) errors.checkIn = `Бронювання доступне на ${MAX_DAYS_AHEAD} днів уперед`;
  return Object.keys(errors).length ? { errors } : { errors, stay: stay.data };
}

/** Shared by the client form (before submit) and the server page (after navigation). */
export function validateSearch(values: FormValues, today: string): {
  query?: SearchQuery;
  errors: Partial<Record<SearchField, string>>;
} {
  const city = findCity(values.city.trim());
  const { stay, errors } = validateStay(values, today);
  const all: Partial<Record<SearchField, string>> = { ...errors };
  if (!city) all.city = "Оберіть місто зі списку";
  if (!city || !stay) return { errors: all };
  return { errors: all, query: { cityId: city.id, ...stay } };
}

/** View params are optional: anything invalid is ignored rather than shown as an error. */
export function parseView(raw: RawParams): ViewState {
  const sort = z.enum(SORTS).catch("recommended").parse(first(raw, "sort"));

  let price: ViewState["price"] = null;
  const priceMatch = /^(\d{1,7})-(\d{1,7})$/.exec(first(raw, "price") ?? "");
  if (priceMatch) {
    const [min, max] = [Number(priceMatch[1]), Number(priceMatch[2])];
    if (min <= max) price = { min, max };
  }

  const stars = [
    ...new Set(
      (first(raw, "stars") ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5),
    ),
  ].sort();

  const ratingRaw = Number(first(raw, "rating"));
  const rating = ratingRaw === 8 || ratingRaw === 9 ? ratingRaw : null;

  return { sort, price, stars, rating };
}

export function parseSearchParams(raw: RawParams, today: string): ParsedSearch {
  const values: FormValues = {
    city: first(raw, "city") ?? "",
    checkIn: first(raw, "checkin") ?? "",
    checkOut: first(raw, "checkout") ?? "",
    adults: first(raw, "adults") ?? "",
  };
  if (!values.city && !values.checkIn && !values.checkOut && !values.adults) return { status: "empty" };

  const { query, errors } = validateSearch({ ...values, adults: values.adults || "2" }, today);
  if (!query) return { status: "invalid", values, errors };
  return { status: "ok", query, view: parseView(raw) };
}

/** Builds `/?city=…` with a stable key order; default view values are omitted. */
export function searchHref(query: SearchQuery, view: ViewState = DEFAULT_VIEW): string {
  const params = new URLSearchParams({
    city: query.cityId,
    checkin: query.checkIn,
    checkout: query.checkOut,
    adults: String(query.adults),
  });
  if (view.sort !== "recommended") params.set("sort", view.sort);
  if (view.price) params.set("price", `${view.price.min}-${view.price.max}`);
  if (view.stars.length) params.set("stars", view.stars.join(","));
  if (view.rating) params.set("rating", String(view.rating));
  return `/?${params}`;
}

/** `/hotels/id?checkin&checkout&adults[&city]` — `city` is optional so older links keep working. */
export function hotelHref(hotelId: string, query: Stay & { cityId?: string | null }): string {
  const params = new URLSearchParams({ checkin: query.checkIn, checkout: query.checkOut, adults: String(query.adults) });
  if (query.cityId) params.set("city", query.cityId);
  return `/hotels/${encodeURIComponent(hotelId)}?${params}`;
}

/**
 * Hand-off to checkout. Throws on a malformed offer token rather than building a bad link.
 * `price` (whole ₴ shown on the hotel page) is a display-only hint for the price-change banner.
 */
export function checkoutHref({ offerId, hotelId, stay, price, cityId }: { offerId: string; hotelId: string; stay: Stay; price?: number; cityId?: string | null }): string {
  const params = new URLSearchParams({
    offerId: offerIdSchema.parse(offerId),
    hotel: hotelId,
    checkin: stay.checkIn,
    checkout: stay.checkOut,
    adults: String(stay.adults),
  });
  if (price != null && Number.isFinite(price)) params.set("price", String(Math.ceil(price)));
  if (cityId) params.set("city", cityId);
  return `/checkout?${params}`;
}

export type CheckoutParams =
  | { status: "ok"; offerId: string; hotelId: string; stay: Stay; shownPrice: number | null; cityId: string | null }
  | { status: "invalid"; backHref: string };

/** Everything here is untrusted and only used to *match* the prebook result. */
export function parseCheckoutParams(raw: Record<string, string | string[] | undefined>, today: string): CheckoutParams {
  const pick = (key: string) => {
    const v = raw[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const hotelId = pick("hotel");
  const validHotel = /^[a-z0-9]{3,32}$/i.test(hotelId);
  const city = findCity(pick("city"));
  const { stay } = validateStay({ checkIn: pick("checkin"), checkOut: pick("checkout"), adults: pick("adults") }, today);
  const offer = offerIdSchema.safeParse(pick("offerId"));
  if (!validHotel || !stay || !offer.success) {
    return { status: "invalid", backHref: validHotel ? (stay ? hotelHref(hotelId, { ...stay, cityId: city?.id }) : `/hotels/${hotelId}`) : "/" };
  }
  const priceRaw = Number(pick("price"));
  const shownPrice = Number.isInteger(priceRaw) && priceRaw > 0 && priceRaw < 100_000_000 ? priceRaw : null;
  return { status: "ok", offerId: offer.data, hotelId, stay, shownPrice, cityId: city?.id ?? null };
}

export function stayKey(stay: Stay): string {
  return `${stay.checkIn}|${stay.checkOut}|${stay.adults}`;
}

/** Stable identity of a search (excludes sort/filters) — used as a Suspense key. */
export function searchKey(query: SearchQuery): string {
  return `${query.cityId}|${query.checkIn}|${query.checkOut}|${query.adults}`;
}

export type HotelStayState =
  | { status: "none"; values: StayValues }
  | { status: "invalid"; values: StayValues; errors: Partial<Record<Exclude<SearchField, "city">, string>> }
  | { status: "ok"; stay: Stay };

/** Hotel page: no dates → suggest defaults; one or bad dates → errors; else a valid stay. */
export function hotelStayState(raw: Record<string, string | string[] | undefined>, today: string): HotelStayState {
  const pick = (key: string) => {
    const v = raw[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const values: StayValues = { checkIn: pick("checkin"), checkOut: pick("checkout"), adults: pick("adults") || "2" };
  if (!values.checkIn && !values.checkOut) {
    const d = defaultStay(today);
    return { status: "none", values: { ...values, checkIn: d.checkIn, checkOut: d.checkOut } };
  }
  const { stay, errors } = validateStay(values, today);
  return stay ? { status: "ok", stay } : { status: "invalid", values, errors };
}
