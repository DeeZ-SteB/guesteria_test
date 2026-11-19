import { beforeEach, describe, expect, it, vi } from "vitest";

const UID = "00000000-0000-4000-8000-00000000000a";
const TID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  limit: { allowed: true } as { allowed: boolean; retryAfter?: number },
  thread: null as null | { id: string; turnCount: number; messages: unknown[] },
  appendTurn: vi.fn(),
  runAssistant: vi.fn(),
  createThread: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ getCurrentUser: async () => mocks.user, getAccountProfile: async () => ({ aiLanguage: "uk" }) }));
vi.mock("@/server/env", () => ({ assistantCaps: () => ({ daily: 10, anonDaily: 5 }) }));
vi.mock("@/server/rate-limit", () => ({ hit: async () => mocks.limit, ipKey: () => "local" }));
vi.mock("@/server/assistant/context", () => ({
  resolveContext: async () => ({ page: { page: "other" }, label: "x", hints: [], facts: ["page: other"] }),
  buildVerifiedContext: () => "<verified_context>\npage: other\n</verified_context>",
}));
vi.mock("@/server/assistant/store", () => ({
  MAX_TURNS: 30,
  loadThread: async () => mocks.thread,
  createThread: mocks.createThread,
  appendTurn: mocks.appendTurn,
  lastTurnAt: async () => null,
  actionsDecidedSince: async () => [],
}));
vi.mock("@/server/assistant/run", () => ({ runAssistant: mocks.runAssistant, sdkStreamer: () => null }));

import { POST } from "./route";

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:8700/api/assistant", {
    method: "POST",
    headers: { origin: "http://localhost:8700", host: "localhost:8700", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const ok = { message: "Привіт", context: { page: "other" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  mocks.limit = { allowed: true };
  mocks.thread = null;
  mocks.createThread.mockResolvedValue(TID);
  mocks.runAssistant.mockImplementation(async ({ emit }) => {
    emit({ event: "text", data: { delta: "Вітаю" } });
    return { appended: [{ message: { role: "assistant", content: [{ type: "text", text: "Вітаю" }] }, ui: [] }], stop: "end_turn" };
  });
});

describe("POST /api/assistant — before the stream", () => {
  it("rejects other origins and non-JSON", async () => {
    expect((await POST(req(ok, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(req(ok, { "content-type": "text/plain" }))).status).toBe(403);
  });
  it("rejects oversized and invalid bodies", async () => {
    expect((await POST(req(ok, { "content-length": "100000" }))).status).toBe(413);
    expect((await POST(req("{nope"))).status).toBe(400);
    expect((await POST(req({ message: "x".repeat(1001), context: { page: "other" } }))).status).toBe(400);
  });
  it("rate limits before any model work", async () => {
    mocks.limit = { allowed: false, retryAfter: 120 };
    const res = await POST(req(ok));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(mocks.runAssistant).not.toHaveBeenCalled();
  });
  it("a full thread asks for a new conversation", async () => {
    mocks.user = { id: UID };
    mocks.thread = { id: TID, turnCount: 30, messages: [] };
    expect((await POST(req({ ...ok, threadId: TID }))).status).toBe(409);
  });
});

describe("POST /api/assistant — stream", () => {
  it("streams meta, text and done; anonymous turns are not stored", async () => {
    const res = await POST(req(ok));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: meta");
    expect(body).toContain('"delta":"Вітаю"');
    expect(body).toContain("event: done");
    expect(mocks.appendTurn).not.toHaveBeenCalled();
    // The user's text is passed after the server-written context, never inside it.
    const sent = mocks.runAssistant.mock.calls[0][0].messages.at(-1);
    expect(sent.content.map((b: { text: string }) => b.text)).toEqual(["<verified_context>\npage: other\n</verified_context>", "Привіт"]);
  });
  it("signed-in: stores the user turn and everything appended, in order", async () => {
    mocks.user = { id: UID };
    await (await POST(req(ok))).text();
    expect(mocks.createThread).toHaveBeenCalled();
    const rows = mocks.appendTurn.mock.calls[0][2];
    expect(rows.map((r: { message: { role: string } }) => r.message.role)).toEqual(["user", "assistant"]);
  });
  it("an unexpected failure after the stream started still ends the stream with an error", async () => {
    mocks.runAssistant.mockImplementation(async () => {
      throw new Error("boom");
    });
    const body = await (await POST(req(ok))).text();
    expect(body).toContain("event: error");
  });
});
