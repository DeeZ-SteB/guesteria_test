"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/feedback";

/** What the assistant is being asked about. Stage 8 sends this to the server (validated there). */
export type AssistantContext =
  | { page: "hotel"; hotelId: string; hotelName: string }
  | { page: "trip"; bookingId: string; hotelName: string }
  | { page: "other" };

const Ctx = createContext<{ open: (context?: AssistantContext) => void } | null>(null);

export function useAssistant() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return value;
}

/**
 * Entry point for the Guesteria AI assistant. Stage 8 replaces the stub panel;
 * the provider API, button and its placement are final.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AssistantContext | null>(null);
  const open = useCallback((next: AssistantContext = { page: "other" }) => setContext(next), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <button
        type="button"
        onClick={() => open()}
        aria-label="Відкрити Guesteria AI"
        data-ai-fab
        className="fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg transition-transform hover:scale-105 bottom-[calc(var(--gs-tabbar-height)+var(--gs-cta-height,0px)+env(safe-area-inset-bottom)+16px)] md:bottom-[calc(var(--gs-cta-height,0px)+24px)] md:right-6 md:flex md:size-auto md:gap-2 md:px-5 md:py-3 md:font-semibold"
      >
        <Sparkles className="size-5" aria-hidden />
        <span className="hidden md:inline">Запитати Guesteria AI</span>
      </button>
      <Sheet open={context !== null} onClose={() => setContext(null)} title="Guesteria AI">
        <EmptyState
          icon={Sparkles}
          title="Асистент зʼявиться незабаром"
          text={
            context?.page === "hotel"
              ? `Він відповідатиме на питання про «${context.hotelName}»: правила, зручності, відгуки гостей.`
              : context?.page === "trip"
                ? `Він знатиме про вашу поїздку в «${context.hotelName}»: пройде чекін, надішле запит готелю, підкаже дорогу.`
                : "Він підбиратиме готелі, відповідатиме про них і допомагатиме з чекіном і запитами до готелю."
          }
          className="py-6"
        />
      </Sheet>
    </Ctx.Provider>
  );
}
