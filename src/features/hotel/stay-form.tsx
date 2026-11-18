"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/cn";
import { adultsLabel } from "@/lib/format";
import { addDays, adjustCheckOut, isIsoDate, MAX_DAYS_AHEAD, MAX_GUESTS, MAX_NIGHTS, nightsBetween } from "@/lib/booking/stay";
import { hotelHref, validateStay, type StayValues } from "@/lib/search/params";

type Errors = Partial<Record<"checkIn" | "checkOut" | "adults", string>>;

/** Compact dates + guests for the hotel page. Navigates to the same hotel with the new stay. */
export function StayForm({
  hotelId,
  cityId,
  today,
  initial,
  errors: serverErrors,
}: {
  hotelId: string;
  cityId: string | null;
  today: string;
  initial: StayValues;
  errors: Errors;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [adults, setAdults] = useState(Number(initial.adults) || 2);
  const [errors, setErrors] = useState<Errors>(serverErrors);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const { stay, errors: next } = validateStay({ checkIn, checkOut, adults: String(adults) }, today);
    setErrors(next);
    if (stay) startTransition(() => router.push(`${hotelHref(hotelId, { ...stay, cityId })}#rooms`, { scroll: false }));
  }

  const field = (error?: string) =>
    cn("min-h-12 w-full rounded-button border bg-surface px-3 text-base [color-scheme:light_dark]", error ? "border-2 border-danger" : "border-line");

  return (
    <form onSubmit={submit} noValidate className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" aria-label="Дати й гості">
      <label className="text-xs text-muted" htmlFor={`${id}-in`}>
        Заїзд
        <input
          id={`${id}-in`}
          type="date"
          value={checkIn}
          min={today}
          max={addDays(today, MAX_DAYS_AHEAD)}
          onChange={(e) => {
            const prev = isIsoDate(checkIn) && isIsoDate(checkOut) ? nightsBetween(checkIn, checkOut) : Number.NaN;
            setCheckIn(e.target.value);
            setCheckOut(adjustCheckOut(e.target.value, checkOut, prev));
          }}
          aria-invalid={errors.checkIn ? true : undefined}
          aria-describedby={errors.checkIn ? `${id}-in-error` : undefined}
          className={cn(field(errors.checkIn), "mt-1 text-ink")}
        />
        {errors.checkIn && (
          <span id={`${id}-in-error`} className="mt-1 block text-danger">
            {errors.checkIn}
          </span>
        )}
      </label>
      <label className="text-xs text-muted" htmlFor={`${id}-out`}>
        Виїзд
        <input
          id={`${id}-out`}
          type="date"
          value={checkOut}
          min={addDays(isIsoDate(checkIn) ? checkIn : today, 1) || undefined}
          max={isIsoDate(checkIn) ? addDays(checkIn, MAX_NIGHTS) : undefined}
          onChange={(e) => setCheckOut(e.target.value)}
          aria-invalid={errors.checkOut ? true : undefined}
          aria-describedby={errors.checkOut ? `${id}-out-error` : undefined}
          className={cn(field(errors.checkOut), "mt-1 text-ink")}
        />
        {errors.checkOut && (
          <span id={`${id}-out-error`} className="mt-1 block text-danger">
            {errors.checkOut}
          </span>
        )}
      </label>
      <div className="flex min-h-12 items-center justify-between gap-3 rounded-button border border-line px-3 sm:justify-start">
        <span className="text-sm font-medium">{adultsLabel(adults)}</span>
        <Stepper value={adults} onChange={setAdults} min={1} max={MAX_GUESTS} label="Дорослі" valueText={adultsLabel(adults)} />
      </div>
      <Button type="submit" size="lg" loading={pending}>
        Показати ціни
      </Button>
    </form>
  );
}
