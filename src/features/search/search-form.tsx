"use client";

import { useId, useState } from "react";
import Form from "next/form";
import { Calendar, CalendarCheck, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/cn";
import { adultsLabel } from "@/lib/format";
import { addDays, adjustCheckOut, isIsoDate, MAX_DAYS_AHEAD, MAX_GUESTS, MAX_NIGHTS, nightsBetween } from "@/lib/booking/stay";
import { validateSearch, type FormValues, type SearchField } from "@/lib/search/params";
import { CityCombobox } from "./city-combobox";

type SearchFormProps = {
  initial: FormValues;
  errors?: Partial<Record<SearchField, string>>;
  today: string;
  layout: "stacked" | "inline";
};

function DateField({
  label,
  name,
  value,
  min,
  max,
  error,
  icon: Icon,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  min?: string;
  max?: string;
  error?: string;
  icon: typeof Calendar;
  onChange: (value: string) => void;
}) {
  // useId: the form can be mounted twice (mobile + desktop copies), ids must stay unique.
  const id = `${useId()}-${name}`;
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-button border bg-surface px-2.5 sm:px-3",
          error ? "border-2 border-danger" : "border-line",
        )}
      >
        <Icon className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted">{label}</span>
          <input
            id={id}
            type="date"
            name={name}
            value={value}
            min={min}
            max={max}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="w-full bg-transparent text-base font-medium text-ink outline-none [color-scheme:light_dark]"
          />
        </span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** GET form to `/`: the URL is the state. Client validation mirrors the server's. */
export function SearchForm({ initial, errors: serverErrors = {}, today, layout }: SearchFormProps) {
  const [checkIn, setCheckIn] = useState(initial.checkIn);
  const [checkOut, setCheckOut] = useState(initial.checkOut);
  const [adults, setAdults] = useState(Number(initial.adults) || 2);
  const [errors, setErrors] = useState(serverErrors);

  function onCheckIn(value: string) {
    const previous = isIsoDate(checkIn) && isIsoDate(checkOut) ? nightsBetween(checkIn, checkOut) : Number.NaN;
    setCheckIn(value);
    setCheckOut(adjustCheckOut(value, checkOut, previous));
    setErrors((e) => ({ ...e, checkIn: undefined, checkOut: undefined }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const values: FormValues = {
      city: String(data.get("city") ?? ""),
      checkIn: String(data.get("checkin") ?? ""),
      checkOut: String(data.get("checkout") ?? ""),
      adults: String(data.get("adults") ?? ""),
    };
    const result = validateSearch(values, today);
    if (!result.query) {
      // Allowed by next/form: cancel the navigation only when the input is invalid.
      event.preventDefault();
      setErrors(result.errors);
    }
  }

  const inline = layout === "inline";
  return (
    <Form
      action="/"
      onSubmit={onSubmit}
      noValidate
      aria-label="Пошук готелів"
      className={cn(
        "grid gap-2",
        inline ? "lg:grid-cols-[1.4fr_1fr_1fr_auto_auto] lg:items-start" : "",
      )}
    >
      <CityCombobox
        name="city"
        defaultCityId={initial.city}
        error={errors.city}
        onSelect={() => setErrors((e) => ({ ...e, city: undefined }))}
      />
      <div className={cn("grid grid-cols-2 gap-2", inline && "lg:contents")}>
        <DateField label="Заїзд" name="checkin" value={checkIn} min={today} max={addDays(today, MAX_DAYS_AHEAD)} error={errors.checkIn} icon={Calendar} onChange={onCheckIn} />
        <DateField
          label="Виїзд"
          name="checkout"
          value={checkOut}
          min={addDays(isIsoDate(checkIn) ? checkIn : today, 1) || undefined}
          max={isIsoDate(checkIn) ? addDays(checkIn, MAX_NIGHTS) : undefined}
          error={errors.checkOut}
          icon={CalendarCheck}
          onChange={(v) => {
            setCheckOut(v);
            setErrors((e) => ({ ...e, checkOut: undefined }));
          }}
        />
      </div>
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-button border border-line bg-surface px-3">
        <span className="flex items-center gap-3">
          <Users className="size-5 text-primary" aria-hidden />
          <span>
            <span className="block text-[11px] text-muted">Гості</span>
            <span className="font-medium">{adultsLabel(adults)}</span>
          </span>
        </span>
        <Stepper name="adults" value={adults} onChange={setAdults} min={1} max={MAX_GUESTS} label="Дорослі" valueText={adultsLabel(adults)} />
      </div>
      <Button type="submit" size="lg" className="min-h-14">
        <Search className="size-5" aria-hidden />
        Знайти
      </Button>
    </Form>
  );
}
