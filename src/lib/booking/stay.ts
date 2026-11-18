import { z } from "zod";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_NIGHTS = 30;
export const MAX_GUESTS = 8;

const isoDate = z.iso.date();

/** Search parameters as they arrive from the URL or a form. */
export const staySchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(MAX_GUESTS),
  })
  .refine((s) => nightsBetween(s.checkIn, s.checkOut) >= 1, {
    message: "Дата виїзду має бути пізніше за дату заїзду",
    path: ["checkOut"],
  })
  .refine((s) => nightsBetween(s.checkIn, s.checkOut) <= MAX_NIGHTS, {
    message: `Максимум ${MAX_NIGHTS} ночей`,
    path: ["checkOut"],
  });

export type Stay = z.infer<typeof staySchema>;

/**
 * Number of nights between two ISO dates (YYYY-MM-DD).
 * Parsed as UTC so daylight-saving changes never shift the count.
 */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.round((end - start) / MS_PER_DAY);
}

/** Today's date (YYYY-MM-DD) in Kyiv, where our guests search from. */
export function todayInKyiv(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(now);
}

/** LiteAPI answers "no availability" for past dates; we report a date error instead. */
export function isPastCheckIn(checkIn: string, now: Date = new Date()): boolean {
  return checkIn < todayInKyiv(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real YYYY-MM-DD date (what a date input yields when filled). */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Adds days to an ISO date (UTC arithmetic, DST-safe).
 * Returns "" for empty/invalid input: it is fed straight from date fields and must never throw.
 */
export function addDays(iso: string, days: number): string {
  if (!isIsoDate(iso) || !Number.isFinite(days)) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_LEAD_DAYS = 14;
export const DEFAULT_NIGHTS = 3;

/** Suggested stay for empty forms and popular-city links. */
export function defaultStay(today: string): Stay {
  const checkIn = addDays(today, DEFAULT_LEAD_DAYS);
  return { checkIn, checkOut: addDays(checkIn, DEFAULT_NIGHTS), adults: 2 };
}

/**
 * After the guest picks a new check-in: keep the previous stay length if the check-out
 * no longer fits, and never exceed the maximum stay.
 */
export function adjustCheckOut(checkIn: string, checkOut: string, previousNights = DEFAULT_NIGHTS): string {
  if (!isIsoDate(checkIn)) return checkOut;
  const nights = isIsoDate(checkOut) ? nightsBetween(checkIn, checkOut) : Number.NaN;
  if (nights >= 1 && nights <= MAX_NIGHTS) return checkOut;
  const previous = Number.isFinite(previousNights) && previousNights >= 1 ? previousNights : DEFAULT_NIGHTS;
  return addDays(checkIn, Math.min(previous, MAX_NIGHTS));
}

/** Hotels rarely sell further out; also bounds how many distinct searches a script can generate. */
export const MAX_DAYS_AHEAD = 365;

export function isTooFarAhead(checkIn: string, now: Date = new Date()): boolean {
  return checkIn > addDays(todayInKyiv(now), MAX_DAYS_AHEAD);
}
