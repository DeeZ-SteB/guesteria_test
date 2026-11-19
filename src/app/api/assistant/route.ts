import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getAccountProfile, getCurrentUser } from "@/server/auth";
import { assistantCaps } from "@/server/env";
import { hit, ipKey } from "@/server/rate-limit";
import { assistantRequestSchema, type StreamEvent } from "@/features/assistant/protocol";
import { encodeSse, SSE_PING } from "@/features/assistant/sse";
import { todayInKyiv } from "@/lib/booking/stay";
import { buildVerifiedContext, resolveContext } from "@/server/assistant/context";
import { actionsDecidedSince, appendTurn, createThread, lastTurnAt, loadThread, MAX_TURNS } from "@/server/assistant/store";
import { runAssistant, sdkStreamer } from "@/server/assistant/run";
import { anonHistoryToMessages } from "@/server/assistant/history";
import { neutralizeTags } from "@/server/assistant/untrusted";
import { jsonError, sameOrigin } from "@/server/assistant/http";

// LiteAPI rates (up to 20 s per call) + up to 6 model steps.
export const maxDuration = 120;

const BODY_MAX = 64_000;

/** Guesteria AI: one user message in, a server-sent event stream out (text, cards, status, errors). */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) return jsonError({ error: "forbidden" }, 403);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return jsonError({ error: "too_long" }, 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError({ error: "invalid" }, 400);
  }
  const parsed = assistantRequestSchema.safeParse(json);
  if (!parsed.success) return jsonError({ error: "invalid" }, 400);
  const body = parsed.data;

  const user = await getCurrentUser();
  const limited = user ? await hit("assistantUser", user.id) : await hit("assistantIp", ipKey(request.headers));
  if (!limited.allowed) return jsonError({ error: "rate_limited", retryAfter: limited.retryAfter }, 429);

  const context = await resolveContext(body.context, user?.id ?? null);
  const today = todayInKyiv();

  // Signed-in history comes from our database only; anonymous history is text from the browser.
  let threadId: string | null = null;
  let history: BetaMessageParam[] = [];
  let decided: string[] = [];
  if (user) {
    const thread = body.threadId ? await loadThread(user.id, body.threadId).catch(() => null) : null;
    if (thread) {
      if (thread.turnCount >= MAX_TURNS) return jsonError({ error: "thread_full" }, 409);
      threadId = thread.id;
      history = thread.messages;
      const since = await lastTurnAt(user.id, thread.id);
      decided = since ? await actionsDecidedSince(user.id, thread.id, since).catch(() => []) : [];
    } else {
      threadId = await createThread(user.id, context.page);
    }
  } else {
    history = anonHistoryToMessages(body.history);
  }

  const replyLanguage = user ? ((await getAccountProfile())?.aiLanguage ?? "auto") : "auto";
  const userTurn: BetaMessageParam = {
    role: "user",
    content: [
      { type: "text", text: buildVerifiedContext(context, { signedIn: Boolean(user), replyLanguage, today, decided }) },
      { type: "text", text: neutralizeTags(body.message) },
    ],
  };

  const caps = assistantCaps();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const requestId = crypto.randomUUID().slice(0, 8);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encodeSse(e));
        } catch {
          open = false;
        }
      };
      const ping = setInterval(() => open && controller.enqueue(SSE_PING), 15_000);
      emit({ event: "meta", data: { threadId } });

      const result = await runAssistant({
        messages: [...history, userTurn],
        kind: user ? "user" : "anon",
        ctx: { userId: user?.id ?? null, threadId, today },
        streamer: sdkStreamer,
        emit,
        signal: abort.signal,
        deadline: Date.now() + 100_000,
        allowCall: async () => {
          const all = await hit("aiAll", "all", { limit: caps.daily, window: 86_400 });
          if (!all.allowed) return false;
          return user ? true : (await hit("aiAnon", "all", { limit: caps.anonDaily, window: 86_400 })).allowed;
        },
        requestId,
      });

      if (user && threadId) {
        await appendTurn(user.id, threadId, [{ message: userTurn, ui: [] }, ...result.appended]).catch(() => {
          console.error(`[assistant] ${requestId} history not saved`);
        });
      }
      emit({ event: "done", data: { stop: result.stop } });
      clearInterval(ping);
      if (open) controller.close();
      open = false;
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
