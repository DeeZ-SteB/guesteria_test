"use client";

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { findCity } from "@/lib/cities";
import { adultsLabel, formatDateRange, nightsLabel } from "@/lib/format";
import { nightsBetween } from "@/lib/booking/stay";
import type { SearchQuery } from "@/lib/search/params";
import { SearchForm } from "./search-form";

/** Phones: a summary bar that expands into the form. Desktop: the form inline under the header. */
export function SearchHeader({ query, today }: { query: SearchQuery; today: string }) {
  const [expanded, setExpanded] = useState(false);
  const city = findCity(query.cityId);
  const initial = { city: query.cityId, checkIn: query.checkIn, checkOut: query.checkOut, adults: String(query.adults) };
  const form = <SearchForm key={JSON.stringify(initial)} initial={initial} today={today} layout="inline" />;

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto max-w-[1200px] px-4 py-3 md:px-8">
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="search-edit"
            className="flex min-h-14 w-full items-center gap-3 rounded-button border-2 border-accent px-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{city?.nameUk}</span>
              <span className="block truncate text-xs text-muted">
                {formatDateRange(query.checkIn, query.checkOut)} · {nightsLabel(nightsBetween(query.checkIn, query.checkOut))} ·{" "}
                {adultsLabel(query.adults)}
              </span>
            </span>
            {expanded ? <ChevronDown className="size-4 rotate-180 text-muted" aria-hidden /> : <Pencil className="size-4 text-muted" aria-hidden />}
            <span className="sr-only">{expanded ? "Згорнути пошук" : "Змінити пошук"}</span>
          </button>
          {expanded && (
            <div id="search-edit" className="mt-3">
              {form}
            </div>
          )}
        </div>
        <div className="hidden lg:block">{form}</div>
      </div>
    </div>
  );
}
