import type { PayAtHotel, RoomOffer } from "./types";
import { includesBreakfast } from "@/lib/board";
import { formatMoney } from "@/lib/money";

export type RateFilters = { breakfast: boolean; freeCancel: boolean };

/** Client-side filters on the hotel page; rooms left without rates disappear. */
export function filterOffers(offers: RoomOffer[], filters: RateFilters, now: Date = new Date()): RoomOffer[] {
  return offers
    .map((offer) => ({
      ...offer,
      rates: offer.rates.filter(
        (rate) =>
          (!filters.breakfast || includesBreakfast(rate.boardCode)) &&
          (!filters.freeCancel ||
            (rate.refundable && (rate.freeCancellationUntil == null || new Date(rate.freeCancellationUntil) > now))),
      ),
    }))
    .filter((offer) => offer.rates.length > 0);
}

export function cheapestRate(offers: RoomOffer[]): { offerId: string; price: RoomOffer["rates"][number]["price"] } | null {
  let best: { offerId: string; price: RoomOffer["rates"][number]["price"] } | null = null;
  for (const offer of offers) {
    for (const rate of offer.rates) {
      if (!best || rate.price.amount < best.price.amount) best = { offerId: rate.offerId, price: rate.price };
    }
  }
  return best;
}

/** "+ 523 ₴ туристичний збір сплачується в готелі" (fees summed when they share a currency). */
export function payAtHotelText(fees: PayAtHotel[]): string | null {
  if (fees.length === 0) return null;
  const sameCurrency = fees.every((f) => f.amount.currency === fees[0].amount.currency);
  // Untranslated supplier labels are English: show the neutral "збір" in the Ukrainian UI.
  const label = (raw: string) => (/[а-яіїєґ]/i.test(raw) ? raw.toLowerCase() : "збір");
  const labels = [...new Set(fees.map((f) => label(f.label)))].join(", ");
  if (sameCurrency) {
    const total = fees.reduce((sum, f) => sum + f.amount.amount, 0);
    return `+ ${formatMoney({ amount: total, currency: fees[0].amount.currency })} ${labels} — сплачується в готелі`;
  }
  return `+ ${fees.map((f) => `${formatMoney(f.amount)} ${label(f.label)}`).join(", ")} — сплачується в готелі`;
}
