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
