"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssistant } from "@/components/shell/assistant-fab";

const HINTS = ["О котрій сніданок?", "Як дістатися з вокзалу?", "Чи можна пізній виїзд?"];

/** Block 7 slot. Desktop: an always-visible card on the right; phones: a sticky bar above the tab bar. */
export function TripAssistantSlot({ bookingId, hotelName }: { bookingId: string; hotelName: string }) {
  const { open } = useAssistant();
  const ask = () => open({ page: "trip", bookingId, hotelName });
  return (
    <>
      <aside data-ai-inline aria-label="Guesteria AI" className="hidden rounded-card border border-line bg-surface p-5 lg:sticky lg:top-24 lg:block">
        <p className="flex items-center gap-2 font-bold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          Guesteria AI
        </p>
        <p className="mt-1 text-sm text-muted">Знає про вашу поїздку: допоможе з чекіном, запитами до готелю й дорогою.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {HINTS.map((h) => (
            <button key={h} type="button" onClick={ask} className="min-h-10 rounded-full border border-line px-3 text-sm hover:border-primary hover:bg-primary-soft">
              {h}
            </button>
          ))}
        </div>
        <Button fullWidth onClick={ask} className="mt-4">
          <Sparkles className="size-4" aria-hidden />
          Запитати Guesteria AI
        </Button>
      </aside>

      <div
        data-sticky-cta
        data-ai-trip-cta
        className="fixed inset-x-0 z-30 flex h-[72px] items-center border-t border-line bg-surface px-4 bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] lg:hidden"
      >
        <Button size="lg" fullWidth onClick={ask}>
          <Sparkles className="size-4" aria-hidden />
          Запитати Guesteria AI
        </Button>
      </div>
    </>
  );
}
