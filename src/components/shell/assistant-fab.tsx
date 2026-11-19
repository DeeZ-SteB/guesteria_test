"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { AssistantPanel, type AssistantContext } from "@/features/assistant/assistant-panel";
import { useAssistantChat, type AssistantChat } from "@/features/assistant/use-assistant-chat";

export type { AssistantContext } from "@/features/assistant/assistant-panel";

type Ctx = {
  open: (context?: AssistantContext) => void;
  chat: AssistantChat;
  /** The page's own context (set by <AssistantPageContext>), used by the floating button. */
  setPageContext: (context: AssistantContext | null) => void;
};

const AssistantCtx = createContext<Ctx | null>(null);

export function useAssistant() {
  const value = useContext(AssistantCtx);
  if (!value) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return value;
}

/** Lets a page tell the floating button what the guest is looking at. Renders nothing. */
export function AssistantPageContext({ value }: { value: AssistantContext }) {
  const { setPageContext } = useAssistant();
  const key = JSON.stringify(value);
  useEffect(() => {
    setPageContext(JSON.parse(key) as AssistantContext);
    return () => setPageContext(null);
  }, [key, setPageContext]);
  return null;
}

/**
 * Guesteria AI: floating button + drawer (full screen on phones, 400 px panel from 768 px).
 * One conversation per tab, shared with the trip page's inline panel.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const chat = useAssistantChat();
  const [openContext, setOpenContext] = useState<AssistantContext | null>(null);
  const [pageContext, setPageContext] = useState<AssistantContext | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const open = useCallback((context?: AssistantContext) => setOpenContext(context ?? pageContext ?? { page: "other" }), [pageContext]);
  const close = useCallback(() => setOpenContext(null), []);
  const value = useMemo(() => ({ open, chat, setPageContext }), [open, chat]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (openContext && !d.open) d.showModal();
    if (!openContext && d.open) d.close();
  }, [openContext]);

  return (
    <AssistantCtx.Provider value={value}>
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
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => e.target === e.currentTarget && close()}
        aria-label="Guesteria AI"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink md:ml-auto md:w-[400px] md:border-l md:border-line md:shadow-2xl"
      >
        {openContext && <AssistantPanel chat={chat} context={openContext} variant="drawer" onClose={close} />}
      </dialog>
    </AssistantCtx.Provider>
  );
}
