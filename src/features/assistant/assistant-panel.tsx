"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles, Square, SquarePen, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AssistantChat } from "./use-assistant-chat";
import { ChatBlock } from "./blocks";
import { MESSAGE_MAX, type PageContext } from "./protocol";

/** What the page tells the assistant (validated again on the server). `label` is for the header only. */
export type AssistantContext =
  | { page: "hotel"; hotelId: string; hotelName: string; checkin?: string; checkout?: string; adults?: number }
  | { page: "trip"; bookingId: string; hotelName: string }
  | { page: "search"; cityId: string; cityName: string; checkin?: string; checkout?: string; adults?: number }
  | { page: "other" };

export function toPageContext(c: AssistantContext): PageContext {
  switch (c.page) {
    case "hotel":
      return { page: "hotel", hotelId: c.hotelId, checkin: c.checkin, checkout: c.checkout, adults: c.adults };
    case "trip":
      return { page: "trip", bookingId: c.bookingId };
    case "search":
      return { page: "search", cityId: c.cityId, checkin: c.checkin, checkout: c.checkout, adults: c.adults };
    default:
      return { page: "other" };
  }
}

const label = (c: AssistantContext) =>
  c.page === "hotel" ? c.hotelName : c.page === "trip" ? `Поїздка · ${c.hotelName}` : c.page === "search" ? `Пошук · ${c.cityName}` : "Ваш консьєрж";

const CHIPS: Record<AssistantContext["page"], string[]> = {
  other: ["Готель у Львові на вихідні", "Що ти вмієш?", "Мої поїздки"],
  search: ["Найкращі за рейтингом", "Зі сніданком до 3000 ₴ за ніч", "Тихий готель у центрі"],
  hotel: ["Чи є парковка?", "Що кажуть гості про шум?", "Які номери зі сніданком?"],
  trip: ["О котрій сніданок?", "Як дістатися з вокзалу?", "Хочу пізній виїзд"],
};

type Hint = "checkin_missing" | "early_arrival";
const HINT_COPY: Record<Hint, { text: string; chip: string }> = {
  checkin_missing: { text: "Ви ще не пройшли онлайн-чекін — це займе хвилину.", chip: "Допоможи пройти чекін" },
  early_arrival: { text: "Ви приїдете раніше часу заселення. Попросити готель про ранній заїзд?", chip: "Попроси ранній заїзд" },
};

/** Proactive greeting on the trip page: computed by the server, no model call. */
function useTripHints(context: AssistantContext): Hint[] {
  const [hints, setHints] = useState<Hint[]>([]);
  const bookingId = context.page === "trip" ? context.bookingId : null;
  useEffect(() => {
    if (!bookingId) return;
    let alive = true;
    fetch(`/api/assistant/context?bookingId=${bookingId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { hints?: unknown }) => {
        if (alive && Array.isArray(d.hints)) setHints(d.hints.filter((h): h is Hint => h === "checkin_missing" || h === "early_arrival"));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bookingId]);
  return bookingId ? hints : [];
}

export function AssistantPanel({
  chat,
  context,
  variant,
  onClose,
}: {
  chat: AssistantChat;
  context: AssistantContext;
  variant: "drawer" | "inline";
  onClose?: () => void;
}) {
  const { state } = chat;
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const hints = useTripHints(context);
  const busy = state.phase !== "idle";
  const page = toPageContext(context);

  useEffect(() => {
    void chat.restore();
  }, [chat]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages, state.status]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    chat.send(text, page);
    setDraft("");
  };

  const chips = [...hints.map((h) => HINT_COPY[h].chip), ...CHIPS[context.page]].slice(0, 4);
  const empty = state.messages.length === 0;

  return (
    <section aria-label="Guesteria AI" className={cn("flex min-h-0 flex-col bg-surface", variant === "inline" ? "h-[min(640px,calc(100dvh-8rem))] rounded-card border border-line" : "h-full")}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Guesteria AI</p>
          <p className="truncate text-xs text-muted">{label(context)}</p>
        </div>
        {!empty && (
          <button type="button" onClick={chat.reset} className="grid size-10 place-items-center rounded-full text-muted hover:bg-bg" aria-label="Нова розмова" title="Нова розмова">
            <SquarePen className="size-4" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full text-muted hover:bg-bg" aria-label="Закрити">
            <X className="size-5" />
          </button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy}>
        {empty && (
          <div className="rounded-card bg-bg p-3 text-sm">
            <p>Привіт! Я допоможу знайти готель, відповім на питання про нього, пройду з вами чекін і передам запит готелю.</p>
            {hints.map((h) => (
              <p key={h} className="mt-2 font-medium text-primary-dark">
                {HINT_COPY[h].text}
              </p>
            ))}
            <p className="mt-2 text-xs text-muted">Я не бронюю і не оплачую сам — лише підготую все для вас.</p>
          </div>
        )}
        {state.messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-on-primary">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="max-w-[95%] text-sm">
              {m.text && <p className="whitespace-pre-line break-words">{m.text}</p>}
              {m.blocks.map((b, i) => (
                <ChatBlock key={i} block={b} onNavigate={variant === "drawer" ? onClose : undefined} />
              ))}
            </div>
          ),
        )}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <span className="flex gap-0.5" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted" />
            </span>
            {state.status ?? "друкує…"}
          </p>
        )}
        {state.error && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-button bg-danger/10 px-3 py-2 text-sm text-danger">
            <span>{state.error.message}</span>
            {state.error.retryable && (
              <button type="button" onClick={() => chat.retry(page)} className="flex shrink-0 items-center gap-1 font-semibold underline">
                <RotateCcw className="size-3.5" aria-hidden />
                Повторити
              </button>
            )}
          </div>
        )}
      </div>

      {empty && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => submit(c)} className="min-h-9 rounded-full border border-line px-3 text-xs hover:border-primary hover:bg-primary-soft">
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <label htmlFor={`ai-input-${variant}`} className="sr-only">
            Повідомлення для Guesteria AI
          </label>
          <textarea
            id={`ai-input-${variant}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(min-width: 768px)").matches) {
                e.preventDefault();
                submit(draft);
              }
            }}
            maxLength={MESSAGE_MAX}
            rows={1}
            placeholder="Запитайте що завгодно…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-button border border-line bg-bg px-3 py-2.5 text-base [field-sizing:content]"
          />
          {busy ? (
            <button type="button" onClick={chat.stop} className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-surface" aria-label="Зупинити">
              <Square className="size-4" fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40" aria-label="Надіслати">
              <ArrowUp className="size-5" />
            </button>
          )}
        </div>
        {draft.length > MESSAGE_MAX * 0.8 && (
          <p className="mt-1 text-right text-xs text-muted">
            {draft.length}/{MESSAGE_MAX}
          </p>
        )}
      </form>
    </section>
  );
}
