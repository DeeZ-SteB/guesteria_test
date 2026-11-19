"use client";

import { use } from "react";
import { browser } from "react-dom";
import Link from "next/link";
import { History, Sparkles, ChevronRight } from "lucide-react";
import { CITIES, findCity } from "@/lib/cities";
import { adultsLabel, formatDateRange } from "@/lib/format";
import { defaultStay } from "@/lib/booking/stay";
import { readRecent } from "@/lib/search/recent";
import { searchHref } from "@/lib/search/params";

/** Reads localStorage, so it renders only in the browser (wrap in <Suspense>). */
export function RecentSearches({ today }: { today: string }) {
  use(browser("Recent searches are stored in this browser only."));
  const recent = readRecent(today);
  if (recent.length === 0) return null;
  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="mb-2 flex items-center gap-2 font-semibold">
        <History className="size-4 text-muted" aria-hidden />
        Останні пошуки
      </h2>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {recent.map((q) => (
          <li key={`${q.cityId}-${q.checkIn}-${q.checkOut}-${q.adults}`} className="shrink-0">
            <Link href={searchHref(q)} className="block min-h-11 rounded-button border border-line bg-surface px-3 py-2 text-sm hover:border-primary">
              <span className="block font-medium">{findCity(q.cityId)?.nameUk}</span>
              <span className="text-xs text-muted">
                {formatDateRange(q.checkIn, q.checkOut)} · {adultsLabel(q.adults)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TILE_GRADIENTS = [
  "from-teal-700 to-teal-300",
  "from-blue-900 to-blue-300",
  "from-amber-700 to-amber-300",
  "from-orange-900 to-orange-300",
  "from-violet-700 to-violet-300",
  "from-slate-700 to-slate-300",
];

export function PopularCities({ today }: { today: string }) {
  const stay = defaultStay(today);
  const popular = CITIES.filter((c) => c.popular).slice(0, 6);
  return (
    <section aria-labelledby="popular-title">
      <h2 id="popular-title" className="mb-2 font-semibold">
        Популярні напрямки
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {popular.map((city, i) => (
          <li key={city.id}>
            <Link
              href={searchHref({ cityId: city.id, ...stay })}
              className={`flex h-24 items-end rounded-card bg-gradient-to-br p-3 font-semibold text-white ${TILE_GRADIENTS[i % TILE_GRADIENTS.length]}`}
            >
              <span>
                {city.nameUk}
                <span className="block text-xs font-normal opacity-90">{city.countryUk}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AiBanner() {
  return (
    <div className="flex items-center gap-3 rounded-card bg-primary-soft p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-primary-dark">Не знаєте, що обрати?</p>
        <p className="text-xs text-primary-dark">Опишіть ідеальний готель — Guesteria AI підбере</p>
      </div>
      <ChevronRight className="size-5 text-primary" aria-hidden />
    </div>
  );
}
