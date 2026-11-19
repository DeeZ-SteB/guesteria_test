import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BetaMessage, BetaMessageParam, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";

const mocks = vi.hoisted(() => ({ runTool: vi.fn() }));
vi.mock("./tools", () => ({
  toolsFor: (kind: string) => [{ name: "search_hotels" }, ...(kind === "user" ? [{ name: "submit_check_in" }] : [])],
  toolLabel: () => "Працюю…",
  runTool: mocks.runTool,
}));

import { buildParams, MAX_TOOL_ROUNDS, runAssistant, sanitizeForReplay, type StepStreamer } from "./run";
import type { StreamEvent } from "@/features/assistant/protocol";

type Block = Record<string, unknown> & { type: string };
const msg = (content: Block[], stop: string): BetaMessage =>
  ({ id: "m", model: "claude-sonnet-5-5", role: "assistant", content, stop_reason: stop, stop_details: null, usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as BetaMessage;
const text = (t: string): Block => ({ type: "text", text: t });
const toolUse = (id: string, input: unknown = {}): Block => ({ type: "tool_use", id, name: "search_hotels", input });

/** A scripted model: each call returns the next message, streaming its text as deltas. */
function scripted(steps: BetaMessage[]) {
  const calls: BetaMessageStreamParams[] = [];
  const streamer: StepStreamer = (params) => {
    calls.push(structuredClone(params));
    const m = steps.shift();
    if (!m) throw new Error("no more steps");
    return {
      events: (async function* () {
        for (const b of m.content) if (b.type === "text") yield { type: "content_block_delta", delta: { type: "text_delta", text: (b as { text: string }).text } };
      })(),
      final: async () => m,
    };
  };
  return { streamer, calls };
}

const user: BetaMessageParam = { role: "user", content: [{ type: "text", text: "Львів на вихідні" }] };

function run(streamer: StepStreamer, over: Partial<Parameters<typeof runAssistant>[0]> = {}) {
  const events: StreamEvent[] = [];
  const controller = new AbortController();
  const result = runAssistant({
    messages: [user],
    kind: "anon",
    ctx: { userId: null, threadId: null, today: "2026-12-01" },
    streamer,
    emit: (e) => events.push(e),
    signal: controller.signal,
    deadline: Date.now() + 60_000,
    allowCall: async () => true,
    requestId: "r",
    ...over,
  });
  return { result, events, controller };
}

beforeEach(() => {
  mocks.runTool.mockReset();
  mocks.runTool.mockResolvedValue({ text: "3 hotels", block: { type: "hotel_cards", hotels: [] } });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("assistant loop", () => {
  it("streams a plain answer", async () => {
    const { streamer } = scripted([msg([text("Привіт!")], "end_turn")]);
    const { result, events } = run(streamer);
    const r = await result;
    expect(r.stop).toBe("end_turn");
    expect(events).toEqual([{ event: "text", data: { delta: "Привіт!" } }]);
    expect(r.appended).toHaveLength(1);
  });

  it("runs tools, returns all results in one message, attaches cards to the final answer", async () => {
    const { streamer, calls } = scripted([msg([text("Шукаю"), toolUse("a"), toolUse("b")], "tool_use"), msg([text("Ось варіанти")], "end_turn")]);
    const { result, events } = run(streamer);
    const r = await result;
    expect(r.stop).toBe("end_turn");
    expect(mocks.runTool).toHaveBeenCalledTimes(2);
    const results = r.appended[1].message;
    expect(results.role).toBe("user");
    expect((results.content as Block[]).map((b) => b.type)).toEqual(["tool_result", "tool_result"]);
    // Cards are stored with the tool round, so a later failure cannot lose them.
    expect(r.appended[0].ui).toHaveLength(2);
    expect(events.filter((e) => e.event === "block")).toHaveLength(2);
    // The second call carries the whole conversation so far.
    expect(calls[1].messages).toHaveLength(3);
  });

  it("caps tool calls per step", async () => {
    const { streamer } = scripted([msg([toolUse("a"), toolUse("b"), toolUse("c"), toolUse("d")], "tool_use"), msg([text("ok")], "end_turn")]);
    const r = await run(streamer).result;
    expect(mocks.runTool).toHaveBeenCalledTimes(3);
    const results = r.appended[1].message.content as Block[];
    expect(results[3]).toMatchObject({ is_error: true });
  });

  it("after 5 tool rounds forces a text answer (tool_choice none)", async () => {
    const steps = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) => msg([toolUse(`t${i}`)], "tool_use"));
    const { streamer, calls } = scripted([...steps, msg([text("Підсумок")], "end_turn")]);
    const r = await run(streamer).result;
    expect(calls).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(calls.at(-1)?.tool_choice).toEqual({ type: "none" });
    expect(calls[0].tool_choice).toEqual({ type: "auto" });
    expect(r.stop).toBe("step_limit");
  });

  it("a refusal replaces streamed text and is stored as a fixed answer", async () => {
    const { streamer } = scripted([msg([text("Частково…")], "refusal")]);
    const { result, events } = run(streamer);
    const r = await result;
    expect(r.stop).toBe("refusal");
    expect(events.map((e) => e.event)).toEqual(["text", "reset", "text"]);
    expect(JSON.stringify(r.appended)).not.toContain("Частково");
  });

  it("never runs a tool whose input was cut off by max_tokens", async () => {
    const { streamer } = scripted([msg([text("Зараз"), toolUse("a", { city_id: "lv" })], "max_tokens")]);
    const r = await run(streamer).result;
    expect(r.stop).toBe("max_tokens");
    expect(mocks.runTool).not.toHaveBeenCalled();
    expect((r.appended[0].message.content as Block[]).map((b) => b.type)).toEqual(["text"]);
  });

  it("stops on the daily cap before calling the model", async () => {
    const { streamer, calls } = scripted([msg([text("x")], "end_turn")]);
    const { result, events } = run(streamer, { allowCall: async () => false });
    expect((await result).stop).toBe("daily_cap");
    expect(calls).toHaveLength(0);
    expect(events[0]).toMatchObject({ event: "error", data: { code: "daily_cap" } });
  });

  it("an abort during tools drops the unanswered tool call from history", async () => {
    const { streamer } = scripted([msg([toolUse("a")], "tool_use")]);
    const controller = new AbortController();
    mocks.runTool.mockImplementation(async () => {
      controller.abort();
      return { text: "x" };
    });
    const r = await run(streamer, { signal: controller.signal }).result;
    expect(r.stop).toBe("aborted");
    expect(r.appended).toHaveLength(0);
  });

  it("past the deadline: a visible retryable error, no model call", async () => {
    const { streamer, calls } = scripted([msg([text("x")], "end_turn")]);
    const { result, events } = run(streamer, { deadline: Date.now() - 1 });
    expect((await result).stop).toBe("timeout");
    expect(calls).toHaveLength(0);
    expect(events[0]).toMatchObject({ event: "error", data: { code: "timeout", retryable: true } });
  });

  it("a permanent API error (4xx) is not offered as retryable", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const streamer: StepStreamer = () => {
      throw new Anthropic.BadRequestError(400, { error: { message: "bad" } }, "bad", new Headers());
    };
    const first = run(streamer);
    expect((await first.result).stop).toBe("error");
    expect(first.events[0]).toMatchObject({ event: "error", data: { code: "unavailable", retryable: false } });
    const later = run(streamer, { messages: [user, { role: "assistant", content: [{ type: "text", text: "a" }] }, user] });
    await later.result;
    expect(later.events[0]).toMatchObject({ event: "error", data: { code: "conversation", retryable: false } });
  });

  it("API failures end with a retryable error, not an exception", async () => {
    const streamer: StepStreamer = () => {
      throw new Error("socket hang up");
    };
    const { result, events } = run(streamer);
    expect((await result).stop).toBe("error");
    expect(events[0]).toMatchObject({ event: "error", data: { retryable: true } });
  });

  it("sends the agreed request shape with a stable, cacheable prefix", () => {
    const a = buildParams([user], "anon", false);
    const b = buildParams([user, user], "user", false);
    expect(a).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
    });
    expect(a.system).toEqual(b.system);
    expect((a.tools ?? []).map((t) => (t as { name: string }).name)).toEqual(["search_hotels"]);
    expect("thinking" in a).toBe(false);
  });

  it("logs usage and tool names but never message text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { streamer } = scripted([msg([text("Секретна відповідь"), toolUse("a", { q: "приватне" })], "tool_use"), msg([text("ok")], "end_turn")]);
    await run(streamer).result;
    const logged = info.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("search_hotels");
    expect(logged).not.toContain("Секретна");
    expect(logged).not.toContain("приватне");
  });
});

describe("sanitizeForReplay", () => {
  it("drops the declined model's thinking and tool calls before the last fallback block, keeps text and the block", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "s1" },
      { type: "text", text: "Part" },
      { type: "tool_use", id: "x", name: "search_hotels", input: {} },
      { type: "fallback", from: {}, to: {} },
      { type: "thinking", thinking: "", signature: "s2" },
      { type: "text", text: "Rest" },
    ] as never[];
    expect(sanitizeForReplay(content).map((b: { type: string }) => b.type)).toEqual(["text", "fallback", "thinking", "text"]);
    const plain = [{ type: "text", text: "a" }] as never[];
    expect(sanitizeForReplay(plain)).toBe(plain);
  });
});
