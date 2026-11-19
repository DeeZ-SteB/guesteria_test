import { z } from "zod";
import type { Money } from "@/lib/money";
import type { PayAtHotel } from "@/lib/hotels/types";

/** What the guest is about to book — built only from the prebook response (server side). */
export type CheckoutQuote = {
  prebookId: string;
  hotelId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  occupancyNumber: number;
  roomName: string;
  boardCode: string | null;
  boardLabel: string;
  refundable: boolean;
  freeCancellationUntil: string | null;
  penalty: Money | null;
  /** Public price (never below LiteAPI's suggested selling price). */
  price: Money;
  payAtHotel: PayAtHotel[];
  changes: { price: boolean; cancellation: boolean; board: boolean };
};

export type ConfirmedBooking = {
  liteapiBookingId: string;
  clientReference: string | null;
  prebookId: string | null;
  hotelId: string | null;
  checkIn: string;
  checkOut: string;
  /** Status as LiteAPI reports it, upper-cased (CONFIRMED, PENDING, ON_REQUEST…). */
  status: string;
  confirmed: boolean;
  /** true / false as LiteAPI reports it; null when the policy can't be read. */
  refundable: boolean | null;
  /** Earliest free-cancellation deadline LiteAPI reports, or null if none/unknown. */
  refundableUntil: string | null;
};

const NAME = /^[\p{L}][\p{L}\s'ʼ’-]*$/u;

export const guestSchema = z.object({
  firstName: z
    .string({ error: "Вкажіть ім'я" })
    .trim()
    .min(1, { error: "Вкажіть ім'я" })
    .max(50, { error: "Ім'я задовге (до 50 символів)" })
    .regex(NAME, { error: "Лише літери, пробіл, апостроф або дефіс" }),
  lastName: z
    .string({ error: "Вкажіть прізвище" })
    .trim()
    .min(1, { error: "Вкажіть прізвище" })
    .max(50, { error: "Прізвище задовге (до 50 символів)" })
    .regex(NAME, { error: "Лише літери, пробіл, апостроф або дефіс" }),
  email: z
    .string({ error: "Вкажіть email" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Вкажіть коректний email" })),
});
export type Guest = z.infer<typeof guestSchema>;

export type CheckoutErrorKind =
  | "session"
  | "unverified"
  | "invalid"
  | "expired"
  | "rate_gone"
  | "guest_rejected"
  | "pending"
  | "support"
  | "failed"
  | "unsaved";

const MESSAGES: Record<CheckoutErrorKind, string> = {
  session: "Сесія завершилась. Увійдіть знову, щоб завершити бронювання.",
  unverified: "Підтвердьте email (лист уже у вашій пошті), щоб бронювати.",
  invalid: "Не вдалося перевірити дані бронювання. Оновіть сторінку.",
  expired: "Час на оформлення минув. Оновіть сторінку, щоб перевірити ціну знову.",
  rate_gone: "Цей тариф уже недоступний. Поверніться до готелю й оберіть інший.",
  guest_rejected: "Сервіс бронювання не прийняв дані гостя. Перевірте імʼя, прізвище та email.",
  pending: "Бронювання ще обробляється. Натисніть «Перевірити ще раз» за кілька секунд — повторного бронювання не буде.",
  support: "Бронювання створено, але його дані відрізняються від обраних. Ми перевіримо його вручну — не бронюйте повторно.",
  failed: "Не вдалося забронювати. Спробуйте ще раз або оберіть інший тариф.",
  unsaved: "Бронювання підтверджено, але ми не змогли його зберегти. Натисніть ще раз — повторного бронювання не буде.",
};

export function checkoutErrorMessage(kind: CheckoutErrorKind): string {
  return MESSAGES[kind];
}

/**
 * Price-change banner. `shownPrice` comes from the URL (what the hotel page showed): an
 * untrusted *display* hint only, never used for charging.
 */
export function priceChange(quote: Pick<CheckoutQuote, "price" | "changes">, shownPrice: number | null): { from: number; to: number } | null {
  const to = Math.ceil(quote.price.amount);
  if (shownPrice != null && Math.abs(shownPrice - to) >= 1) return { from: shownPrice, to };
  return null;
}

/**
 * Cancellation terms to store: never more generous than what the guest saw at checkout or what
 * the booking says. Non-refundable on either side stays non-refundable.
 */
export function storedCancellation(
  quote: { refundable: boolean; freeCancellationUntil: string | null },
  booked: { refundable: boolean | null; refundableUntil: string | null },
): { refundable: boolean; until: string | null } {
  if (!quote.refundable || booked.refundable === false) return { refundable: false, until: null };
  const candidates = [quote.freeCancellationUntil, booked.refundableUntil].filter((d): d is string => !!d);
  return { refundable: true, until: candidates.length ? candidates.sort()[0] : null };
}
