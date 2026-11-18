"use client";

import { useState } from "react";
import {
  Accessibility, ArrowUpDown, Bus, Car, Check, Cigarette, ConciergeBell, Coffee, Dog, Dumbbell, Flame, Lock,
  Luggage, Martini, Presentation, Shield, Shirt, Snowflake, Sparkles, Sun, Users, Utensils, VolumeX, Waves, Wifi, BellRing,
  type LucideIcon,
} from "lucide-react";
import { allFacilities, topFacilities, type FacilityKey } from "@/lib/hotels/facilities";
import { Sheet } from "@/components/ui/sheet";

const ICONS: Partial<Record<FacilityKey, LucideIcon>> = {
  wifi: Wifi, parking: Car, pool: Waves, spa: Sparkles, fitness: Dumbbell, restaurant: Utensils, bar: Martini,
  breakfast: Coffee, roomService: BellRing, airportShuttle: Bus, aircon: Snowflake, frontDesk: ConciergeBell,
  family: Users, pets: Dog, elevator: ArrowUpDown, accessible: Accessibility, nonSmoking: Cigarette, terrace: Sun,
  laundry: Shirt, luggage: Luggage, concierge: ConciergeBell, heating: Flame, safe: Lock, soundproof: VolumeX,
  meeting: Presentation, security: Shield,
};

export function Facilities({ facilities }: { facilities: string[] }) {
  const [open, setOpen] = useState(false);
  const top = topFacilities(facilities, 8);
  const all = allFacilities(facilities);
  if (all.length === 0) return null;

  return (
    <section className="bg-surface px-4 py-4 md:rounded-card md:border md:border-line md:p-6" aria-labelledby="facilities-title">
      <h2 id="facilities-title" className="mb-3 text-lg font-semibold">
        Зручності
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
        {top.map(({ key, label }) => {
          const Icon = ICONS[key] ?? Check;
          return (
            <li key={key} className="flex items-center gap-2">
              <Icon className="size-5 shrink-0 text-primary" aria-hidden />
              {label}
            </li>
          );
        })}
      </ul>
      {all.length > top.length && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 text-sm font-medium text-primary">
          Усі {all.length} зручностей
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Усі зручності">
        <ul className="columns-1 gap-6 text-sm sm:columns-2">
          {all.map((label) => (
            <li key={label} className="flex break-inside-avoid items-start gap-2 py-1">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
