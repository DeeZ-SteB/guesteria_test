"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/feedback";

/**
 * Entry point for the Guesteria AI assistant. Stage 8 replaces the stub panel;
 * the button itself and its placement are final.
 */
export function AssistantFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Відкрити Guesteria AI"
        className="fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-primary text-on-primary shadow-lg transition-transform hover:scale-105 bottom-[calc(var(--gs-tabbar-height)+env(safe-area-inset-bottom)+16px)] md:bottom-6 md:right-6 md:flex md:size-auto md:gap-2 md:px-5 md:py-3 md:font-semibold"
      >
        <Sparkles className="size-5" aria-hidden />
        <span className="hidden md:inline">Запитати Guesteria AI</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Guesteria AI">
        <EmptyState
          icon={Sparkles}
          title="Асистент з'явиться незабаром"
          text="Він підбиратиме готелі, відповідатиме про них і допомагатиме з чекіном і запитами до готелю."
          className="py-6"
        />
      </Sheet>
    </>
  );
}
