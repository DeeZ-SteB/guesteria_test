import { describe, expect, it } from "vitest";
import { chatReducer, historyForRequest, initialChat, type ChatState } from "./chat-reducer";

const send = (s: ChatState, text = "hi") => chatReducer(s, { type: "send", text, userId: "u1", assistantId: "a1" });

describe("chat reducer", () => {
  it("streams text, status and cards into the assistant message", () => {
    let s = send(initialChat);
    expect(s.phase).toBe("waiting");
    s = chatReducer(s, { type: "event", event: { event: "meta", data: { threadId: "11111111-1111-4111-8111-111111111111" } } });
    s = chatReducer(s, { type: "event", event: { event: "status", data: { tool: "search_hotels", label: "Шукаю…" } } });
    expect(s.status).toBe("Шукаю…");
    s = chatReducer(s, { type: "event", event: { event: "text", data: { delta: "При" } } });
    s = chatReducer(s, { type: "event", event: { event: "text", data: { delta: "віт" } } });
    s = chatReducer(s, { type: "event", event: { event: "block", data: { block: { type: "hotel_cards", hotels: [] } } } });
    s = chatReducer(s, { type: "event", event: { event: "done", data: { stop: "end_turn" } } });
    expect(s.phase).toBe("idle");
    expect(s.threadId).toBe("11111111-1111-4111-8111-111111111111");
    expect(s.messages.at(-1)).toMatchObject({ text: "Привіт", state: "complete" });
    expect(s.messages.at(-1)?.blocks).toHaveLength(1);
  });

  it("a refusal reset clears streamed text; an empty answer disappears", () => {
    let s = send(initialChat);
    s = chatReducer(s, { type: "event", event: { event: "text", data: { delta: "x" } } });
    s = chatReducer(s, { type: "event", event: { event: "reset", data: {} } });
    expect(s.messages.at(-1)?.text).toBe("");
    s = chatReducer(s, { type: "event", event: { event: "done", data: { stop: "error" } } });
    expect(s.messages).toHaveLength(1);
  });

  it("stop keeps the partial answer; failure and retry", () => {
    let s = send(initialChat);
    s = chatReducer(s, { type: "event", event: { event: "text", data: { delta: "Частина" } } });
    s = chatReducer(s, { type: "stopped" });
    expect(s.messages.at(-1)).toMatchObject({ text: "Частина", state: "complete" });
    s = send(s, "ще");
    s = chatReducer(s, { type: "failed", error: { code: "overloaded", message: "x", retryable: true } });
    expect(s.error?.retryable).toBe(true);
    s = chatReducer(s, { type: "retrying" });
    expect(s.messages.map((m) => m.text)).toEqual(["hi", "Частина"]);
    expect(s.error).toBeNull();
  });

  it("history for anonymous requests is text only and capped", () => {
    let s = initialChat;
    for (let i = 0; i < 15; i++) {
      s = send(s, `q${i}`);
      s = chatReducer(s, { type: "event", event: { event: "text", data: { delta: "a".repeat(5000) } } });
      s = chatReducer(s, { type: "event", event: { event: "done", data: { stop: "end_turn" } } });
    }
    const h = historyForRequest(s.messages);
    expect(h).toHaveLength(20);
    expect(Math.max(...h.map((m) => m.text.length))).toBe(4000);
    expect(Object.keys(h[0]).sort()).toEqual(["role", "text"]);
  });
});
