"use client";

import { useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { findCity, searchCities, type City } from "@/lib/cities";

type CityComboboxProps = {
  name: string;
  defaultCityId?: string;
  error?: string;
  onSelect?: (city: City) => void;
};

const label = (city: City) => `${city.nameUk}, ${city.countryUk}`;

/** ARIA 1.2 combobox with list autocomplete. Submits the city id in a hidden input. */
export function CityCombobox({ name, defaultCityId, error, onSelect }: CityComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const initial = defaultCityId ? findCity(defaultCityId) : undefined;
  const [selected, setSelected] = useState<City | undefined>(initial);
  const [text, setText] = useState(initial ? label(initial) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => searchCities(selected && text === label(selected) ? "" : text), [text, selected]);

  function choose(city: City) {
    setSelected(city);
    setText(label(city));
    setOpen(false);
    onSelect?.(city);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function onBlur() {
    // Let a click on an option land first.
    setTimeout(() => {
      setOpen(false);
      const exact = searchCities(text, 50).find(
        (c) => c.nameUk.toLowerCase() === text.trim().toLowerCase() || c.cityName.toLowerCase() === text.trim().toLowerCase(),
      );
      if (exact && exact.id !== selected?.id) choose(exact);
    }, 120);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Місто
      </label>
      <div
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-button border bg-surface px-3",
          error ? "border-2 border-danger" : "border-line",
        )}
      >
        <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted" aria-hidden>
            Місто
          </span>
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete="off"
            placeholder="Куди їдете?"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSelected(undefined);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
          />
        </div>
      </div>
      <input type="hidden" name={name} value={selected?.id ?? text} />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Міста"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-xl"
        >
          {options.map((city, index) => (
            <li
              key={city.id}
              id={`${listId}-${city.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(city)}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-button px-3 text-sm",
                index === active && "bg-primary-soft",
              )}
            >
              <MapPin className="size-4 text-muted" aria-hidden />
              <span>
                <span className="font-medium">{city.nameUk}</span>
                <span className="text-muted">, {city.countryUk}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
