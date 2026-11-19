"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarX, History, Luggage } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/feedback";
import { buttonClasses } from "@/components/ui/button";
import { nearestTripId, type TripGroups, type TripRow } from "@/lib/booking/trips";
import { TripCard } from "./trip-card";
import { CancelSheet } from "./cancel-sheet";

type Sub = keyof TripGroups;

const EMPTY: Record<Sub, { icon: typeof Luggage; title: string; text: string }> = {
  upcoming: { icon: Luggage, title: "Поки немає поїздок", text: "Тут з'являться ваші бронювання, онлайн-чекін і запити до готелю." },
  past: { icon: History, title: "Минулих поїздок немає", text: "Після виїзду поїздка переміститься сюди." },
  cancelled: { icon: CalendarX, title: "Скасованих бронювань немає", text: "" },
};

export function TripsView({ groups, today }: { groups: TripGroups; today: string }) {
  const [sub, setSub] = useState<Sub>("upcoming");
  const [cancelling, setCancelling] = useState<TripRow | null>(null);
  const items = groups[sub];
  const nearest = nearestTripId(groups.upcoming, today);
  const empty = EMPTY[sub];

  return (
    <section aria-labelledby="trips-title">
      <h2 id="trips-title" className="sr-only">
        Поїздки
      </h2>
      <Tabs
        label="Поїздки"
        value={sub}
        onChange={setSub}
        className="max-w-md"
        items={[
          { value: "upcoming", label: `Майбутні${groups.upcoming.length ? ` · ${groups.upcoming.length}` : ""}` },
          { value: "past", label: `Минулі${groups.past.length ? ` · ${groups.past.length}` : ""}` },
          { value: "cancelled", label: `Скасовані${groups.cancelled.length ? ` · ${groups.cancelled.length}` : ""}` },
        ]}
      />
      {items.length === 0 ? (
        <div className="mt-4 rounded-card border border-line bg-surface">
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            text={empty.text || undefined}
            action={
              sub === "upcoming" ? (
                <Link href="/" className={buttonClasses()}>
                  Знайти готель
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" role="list">
          {items.map((trip) => (
            <li key={trip.id}>
              <TripCard trip={trip} today={today} nearestId={nearest} onCancel={() => setCancelling(trip)} />
            </li>
          ))}
        </ul>
      )}
      <CancelSheet trip={cancelling} onClose={() => setCancelling(null)} />
    </section>
  );
}
