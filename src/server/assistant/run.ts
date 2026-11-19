import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { anthropicKey } from "@/server/env";
import type {
  DoneReason,
  StreamEvent,
  UiBlock,
} from "@/features/assistant/protocol";
import { SYSTEM_PROMPT } from "./prompt";
import {
  runTool,
  toolLabel,
  toolsFor,
  type ToolCtx,
  type ToolsKind,
} from "./tools";
import { logStep } from "./log";

export const MODEL = "claude-sonnet-5-5";
export const MAX_TOOL_ROUNDS = 5;
export const MAX_CALLS_PER_STEP = 3;
export const MAX_TOKENS = 1024;

/** The only shape of stream events the loop relies on. */
type StreamEventLike = {
  type: string;
  delta?: { type: string; text?: string };
};
export type StepStreamer = (
  params: BetaMessageStreamParams,
  signal: AbortSignal,
) => {
  events: AsyncIterable<StreamEventLike>;
  final: () => Promise<BetaMessage>;
};

let client: Anthropic | null = null;
/** Production streamer: the official SDK, beta namespace (server-side refusal fallback). */
export const sdkStreamer: StepStreamer = (params, signal) => {
  client ??= new Anthropic({
    apiKey: anthropicKey(),
    maxRetries: 1,
    timeout: 60_000,
  });
  const stream = client.beta.messages.stream(params, { signal });
  return {
    events: stream as AsyncIterable<StreamEventLike>,
    final: () => stream.finalMessage(),
  };
};

export function buildParams(
  messages: BetaMessageParam[],
  kind: ToolsKind,
  finalRound: boolean,
): BetaMessageStreamParams {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // A safety refusal is re-run on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    // Frozen prefix (tools → system) is cached; top-level cache_control caches the growing history.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    cache_control: { type: "ephemeral" },
    tools: toolsFor(kind),
    tool_choice: finalRound ? { type: "none" } : { type: "auto" },
    messages,
  } as BetaMessageStreamParams;
}

/**
 * After a mid-output fallback, blocks of the declined model before the last `fallback` block must
 * not be echoed (except text); the fallback block itself stays where it was.
 */
export function sanitizeForReplay(
  content: BetaContentBlockParam[],
): BetaContentBlockParam[] {
  const boundary = content.map((b) => b.type).lastIndexOf("fallback");
  if (boundary === -1) return content;
  return content.filter(
    (b, i) =>
      i >= boundary ||
      !["thinking", "redacted_thinking", "tool_use"].includes(b.type),
  );
}

export type RunInput = {
  messages: BetaMessageParam[];
  kind: ToolsKind;
  ctx: ToolCtx;
  streamer: StepStreamer;
  emit: (e: StreamEvent) => void;
  signal: AbortSignal;
  deadline: number;
  /** Cost guard before every model call. */
  allowCall: () => Promise<boolean>;
  requestId: string;
};

export type RunResult = {
  appended: Array<{ message: BetaMessageParam; ui: UiBlock[] }>;
  stop: DoneReason | "daily_cap" | "error";
};

const REFUSAL_TEXT = "Вибачте, з цим я не можу допомогти.";

/** The tool loop. Never throws: every outcome ends in a stop reason (and events already emitted). */
export async function runAssistant(input: RunInput): Promise<RunResult> {
  const { kind, ctx, streamer, emit, signal } = input;
  const appended: RunResult["appended"] = [];
  const history = () => [...input.messages, ...appended.map((a) => a.message)];
  // A tool round whose results never arrived must not stay in history (tool_use without tool_result).
  const dropDanglingToolUse = () => {
    const last = appended.at(-1);
    if (
      last?.message.role === "assistant" &&
      Array.isArray(last.message.content) &&
      last.message.content.some((b) => b.type === "tool_use")
    )
      appended.pop();
  };

  const timedOut = () => {
    emit({
      event: "error",
      data: {
        code: "timeout",
        message: "Відповідь готується задовго. Спробуйте ще раз.",
        retryable: true,
      },
    });
    return { appended, stop: "timeout" as const };
  };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    if (signal.aborted) return { appended, stop: "aborted" };
    if (Date.now() > input.deadline) return timedOut();
    if (!(await input.allowCall())) {
      emit({
        event: "error",
        data: {
          code: "daily_cap",
          message: "Асистент на сьогодні вичерпав ліміт. Спробуйте завтра.",
          retryable: false,
        },
      });
      return { appended, stop: "daily_cap" };
    }

    const started = Date.now();
    let message: BetaMessage;
    try {
      // The model call itself also stops at the deadline (the route's maxDuration has a margin for tools).
      const callSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, input.deadline - Date.now())),
      ]);
      const step = streamer(
        buildParams(history(), kind, round === MAX_TOOL_ROUNDS),
        callSignal,
      );
      for await (const ev of step.events) {
        if (
          ev.type === "content_block_delta" &&
          ev.delta?.type === "text_delta" &&
          ev.delta.text
        )
          emit({ event: "text", data: { delta: ev.delta.text } });
      }
      message = await step.final();
    } catch (error) {
      if (signal.aborted) return { appended, stop: "aborted" };
      if (
        Date.now() >= input.deadline ||
        error instanceof Anthropic.APIUserAbortError
      )
        return timedOut();
      const overloaded =
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.InternalServerError ||
        error instanceof Anthropic.APIConnectionError;
      // Other 4xx: retrying the same conversation would fail the same way.
      const permanent =
        error instanceof Anthropic.APIError &&
        !overloaded &&
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500;
      logStep({
        requestId: input.requestId,
        kind,
        step: round,
        error:
          error instanceof Anthropic.APIError
            ? `api_${error.status}`
            : "network",
        latencyMs: Date.now() - started,
      });
      emit({
        event: "error",
        data: permanent
          ? // With history, a fresh conversation may help; with none, it is our configuration (e.g. API billing).
            input.messages.length > 1
            ? {
                code: "conversation",
                message:
                  "Не вдалося продовжити цю розмову. Почніть нову розмову.",
                retryable: false,
              }
            : {
                code: "unavailable",
                message: "Асистент тимчасово недоступний. Спробуйте пізніше.",
                retryable: false,
              }
          : {
              code: overloaded ? "overloaded" : "upstream",
              message: overloaded
                ? "Асистент перевантажений. Спробуйте ще раз."
                : "Не вдалося отримати відповідь.",
              retryable: true,
            },
      });
      return { appended, stop: "error" };
    }

    const content = sanitizeForReplay(
      message.content as unknown as BetaContentBlockParam[],
    );
    const toolUses = content.filter(
      (b): b is Extract<BetaContentBlockParam, { type: "tool_use" }> =>
        b.type === "tool_use",
    );
    logStep({
      requestId: input.requestId,
      kind,
      step: round,
      model: message.model,
      stopReason: message.stop_reason,
      refusalCategory: message.stop_details?.category ?? null,
      fallback: content.some((b) => b.type === "fallback"),
      usage: message.usage,
      tools: toolUses.map((t) => t.name),
      latencyMs: Date.now() - started,
    });

    if (message.stop_reason === "refusal") {
      emit({ event: "reset", data: {} });
      emit({ event: "text", data: { delta: REFUSAL_TEXT } });
      appended.push({
        message: {
          role: "assistant",
          content: [{ type: "text", text: REFUSAL_TEXT }],
        },
        ui: [],
      });
      return { appended, stop: "refusal" };
    }

    if (message.stop_reason === "max_tokens") {
      // Never run a tool on input cut off mid-way; keep what was said.
      const kept = content.filter((b) => b.type !== "tool_use");
      const hasText = kept.some((b) => b.type === "text" && b.text.trim());
      appended.push({
        message: {
          role: "assistant",
          content: hasText ? kept : [...kept, { type: "text", text: "…" }],
        },
        ui: [],
      });
      emit({
        event: "error",
        data: {
          code: "truncated",
          message:
            "Відповідь вийшла задовгою. Уточніть, будь ласка, запитання.",
          retryable: false,
        },
      });
      return { appended, stop: "max_tokens" };
    }

    if (toolUses.length === 0) {
      if (content.length > 0)
        appended.push({ message: { role: "assistant", content }, ui: [] });
      return {
        appended,
        stop: round === MAX_TOOL_ROUNDS ? "step_limit" : "end_turn",
      };
    }

    const roundUi: UiBlock[] = [];
    appended.push({ message: { role: "assistant", content }, ui: roundUi });
    const results: BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (call, i): Promise<BetaToolResultBlockParam> => {
        if (i >= MAX_CALLS_PER_STEP)
          return {
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: "too_many_calls: at most 3 tool calls per step.",
          };
        emit({
          event: "status",
          data: { tool: call.name, label: toolLabel(call.name) },
        });
        const out = await runTool(call.name, call.input, ctx, kind);
        if (out.block) {
          roundUi.push(out.block);
          emit({ event: "block", data: { block: out.block } });
        }
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: out.text,
          ...(out.isError ? { is_error: true } : {}),
        };
      }),
    );
    if (signal.aborted) {
      dropDanglingToolUse();
      return { appended, stop: "aborted" };
    }
    // All results of one step in ONE user message.
    appended.push({ message: { role: "user", content: results }, ui: [] });
  }
  return { appended, stop: "step_limit" };
}
