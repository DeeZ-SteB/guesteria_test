"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { z } from "zod";
import { newUuid } from "@/lib/id/uuid";
import { chatReducer, historyForRequest, initialChat, type ChatMessage } from "./chat-reducer";
import { MESSAGE_MAX, streamEventSchema, uiBlockSchema, type PageContext } from "./protocol";
import { createSseParser } from "./sse";

const THREAD_KEY = "gs:assistant-thread";

const PREFLIGHT_COPY: Record<string, string> = {
  rate_limited: "Забагато повідомлень. Спробуйте трохи пізніше.",
  thread_full: "Розмова завелика. Почніть нову розмову.",
  too_long: "Повідомлення задовге.",
  invalid: "Не вдалося надіслати повідомлення.",
  forbidden: "Оновіть сторінку і спробуйте ще раз.",
};

const storage = {
  get: () => {
    try {
      return window.sessionStorage.getItem(THREAD_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) window.sessionStorage.setItem(THREAD_KEY, v);
      else window.sessionStorage.removeItem(THREAD_KEY);
    } catch {
      // storage unavailable: the conversation just won't survive a reload
    }
  },
};

const historySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string(), blocks: z.array(z.unknown()) })).nullable(),
});

/** One conversation per browser tab, shared by the drawer and the trip page's inline panel. */
export function useAssistantChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const controller = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    if (state.threadId) storage.set(state.threadId);
  }, [state]);

  /** Re-open the stored thread (signed-in users) once. */
  const restore = useCallback(async () => {
    if (loaded.current) return;
    loaded.current = true;
    const id = storage.get();
    if (!id || !z.uuid().safeParse(id).success) return;
    try {
      const res = await fetch(`/api/assistant/threads/${id}`, { cache: "no-store" });
      const parsed = historySchema.safeParse(await res.json());
      if (!res.ok || !parsed.success || !parsed.data.messages) {
        storage.set(null);
        return;
      }
      const messages: ChatMessage[] = parsed.data.messages.map((m) => ({
        id: newUuid(),
        role: m.role,
        text: m.text,
        blocks: m.blocks.flatMap((b) => {
          const p = uiBlockSchema.safeParse(b);
          return p.success ? [p.data] : [];
        }),
        state: "complete",
      }));
      dispatch({ type: "loaded", threadId: id, messages });
    } catch {
      // offline: start fresh
    }
  }, []);

  const run = useCallback(async (text: string, context: PageContext) => {
    const body = JSON.stringify({ message: text, context, threadId: stateRef.current.threadId, history: historyForRequest(stateRef.current.messages) });
    dispatch({ type: "send", text, userId: newUuid(), assistantId: newUuid() });
    const ac = new AbortController();
    controller.current = ac;
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ac.signal });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        if (err.error === "thread_full") storage.set(null);
        dispatch({ type: "failed", error: { code: err.error ?? "upstream", message: PREFLIGHT_COPY[err.error ?? ""] ?? "Не вдалося отримати відповідь.", retryable: err.error !== "thread_full" && err.error !== "too_long" } });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let done = false;
      const feed = createSseParser((event, data) => {
        const parsed = streamEventSchema.safeParse({ event, data });
        if (!parsed.success) return; // unknown or malformed events are ignored
        if (parsed.data.event === "done") done = true;
        dispatch({ type: "event", event: parsed.data });
      });
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        feed(value);
      }
      if (!done) dispatch({ type: "failed", error: { code: "upstream", message: "Зʼєднання перервалося.", retryable: true } });
    } catch {
      if (ac.signal.aborted) dispatch({ type: "stopped" });
      else dispatch({ type: "failed", error: { code: "network", message: "Немає зʼєднання. Спробуйте ще раз.", retryable: true } });
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, []);

  const send = useCallback(
    (text: string, context: PageContext) => {
      const trimmed = text.trim().slice(0, MESSAGE_MAX);
      if (!trimmed || stateRef.current.phase !== "idle") return;
      void run(trimmed, context);
    },
    [run],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const retry = useCallback(
    (context: PageContext) => {
      const lastUser = stateRef.current.messages.findLast((m) => m.role === "user");
      if (!lastUser || stateRef.current.phase !== "idle") return;
      dispatch({ type: "retrying" });
      void run(lastUser.text, context);
    },
    [run],
  );

  const reset = useCallback(() => {
    controller.current?.abort();
    storage.set(null);
    dispatch({ type: "reset" });
  }, []);

  return useMemo(() => ({ state, send, stop, retry, reset, restore }), [state, send, stop, retry, reset, restore]);
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
