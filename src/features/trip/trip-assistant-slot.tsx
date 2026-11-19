"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantPageContext, useAssistant } from "@/components/shell/assistant-fab";
import { AssistantPanel } from "@/features/assistant/assistant-panel";

/** Block 7. Desktop: the assistant is always open on the right; phones: a sticky bar above the tab bar. */
export function TripAssistantSlot({ bookingId, hotelName }: { bookingId: string; hotelName: string }) {
  const { open, chat } = useAssistant();
  const context = { page: "trip" as const, bookingId, hotelName };
  return (
    <>
      <AssistantPageContext value={context} />
      <aside data-ai-inline aria-label="Guesteria AI" className="hidden lg:sticky lg:top-24 lg:block">
        <AssistantPanel chat={chat} context={context} variant="inline" />
      </aside>

      <div
        data-sticky-cta
        data-ai-trip-cta
        className="fixed inset-x-0 z-30 flex h-[72px] items-center border-t border-line bg-surface px-4 bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom))] lg:hidden"
      >
        <Button size="lg" fullWidth onClick={() => open(context)}>
          <Sparkles className="size-4" aria-hidden />
          Запитати Guesteria AI
        </Button>
      </div>
    </>
  );
}
