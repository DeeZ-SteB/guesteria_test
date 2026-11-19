import type { StreamEvent, UiBlock } from "./protocol";

export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; blocks: UiBlock[]; state: "complete" | "streaming" };
export type ChatError = { code: string; message: string; retryable: boolean };
export type ChatState = {
  messages: ChatMessage[];
  phase: "idle" | "waiting" | "streaming";
  /** "Шукаю готелі…" while a tool runs. */
  status: string | null;
  error: ChatError | null;
  threadId: string | null;
};

export type ChatAction =
  | { type: "send"; text: string; userId: string; assistantId: string }
  | { type: "event"; event: StreamEvent }
  | { type: "stopped" }
  | { type: "failed"; error: ChatError }
  | { type: "reset" }
  | { type: "loaded"; threadId: string; messages: ChatMessage[] }
  | { type: "retrying" };

export const initialChat: ChatState = { messages: [], phase: "idle", status: null, error: null, threadId: null };

const updateLast = (messages: ChatMessage[], fn: (m: ChatMessage) => ChatMessage) => {
  const i = messages.findLastIndex((m) => m.role === "assistant");
  return i === -1 ? messages : messages.map((m, j) => (j === i ? fn(m) : m));
};

/** Drops an assistant placeholder that never received anything. */
const finalize = (messages: ChatMessage[]) =>
  messages.flatMap((m) => (m.state === "streaming" ? (m.text || m.blocks.length ? [{ ...m, state: "complete" as const }] : []) : [m]));

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        ...state,
        phase: "waiting",
        status: null,
        error: null,
        messages: [
          ...state.messages,
          { id: action.userId, role: "user", text: action.text, blocks: [], state: "complete" },
          { id: action.assistantId, role: "assistant", text: "", blocks: [], state: "streaming" },
        ],
      };
    case "event": {
      const e = action.event;
      switch (e.event) {
        case "meta":
          return { ...state, threadId: e.data.threadId ?? state.threadId };
        case "status":
          return { ...state, status: e.data.label };
        case "text":
          return { ...state, phase: "streaming", status: null, messages: updateLast(state.messages, (m) => ({ ...m, text: m.text + e.data.delta })) };
        case "reset":
          return { ...state, messages: updateLast(state.messages, (m) => ({ ...m, text: "" })) };
        case "block":
          return { ...state, messages: updateLast(state.messages, (m) => ({ ...m, blocks: [...m.blocks, e.data.block] })) };
        case "error":
          return { ...state, error: { code: e.data.code, message: e.data.message, retryable: e.data.retryable } };
        case "done":
          return { ...state, phase: "idle", status: null, messages: finalize(state.messages) };
      }
      return state;
    }
    case "stopped":
      return { ...state, phase: "idle", status: null, messages: finalize(state.messages) };
    case "failed":
      return { ...state, phase: "idle", status: null, error: action.error, messages: finalize(state.messages) };
    case "retrying": {
      // Remove the last exchange; it is sent again.
      const lastUser = state.messages.findLastIndex((m) => m.role === "user");
      return { ...state, error: null, messages: lastUser === -1 ? state.messages : state.messages.slice(0, lastUser) };
    }
    case "loaded":
      // A restore that arrives after the guest already started talking is ignored.
      if (state.messages.length > 0 || state.phase !== "idle") return state;
      return { ...initialChat, threadId: action.threadId, messages: action.messages };
    case "reset":
      return initialChat;
  }
}

/** Text-only history for anonymous visitors (the server ignores it for signed-in users). */
export function historyForRequest(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; text: string }> {
  return messages
    .filter((m) => m.state === "complete" && m.text.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, text: m.text.slice(0, m.role === "user" ? 1000 : 4000) }));
}
