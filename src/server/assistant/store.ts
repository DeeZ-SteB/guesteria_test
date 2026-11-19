import "server-only";
import { z } from "zod";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { createAdminClient } from "@/server/db/admin";
import { uiBlockSchema, type PageContext, type UiBlock } from "@/features/assistant/protocol";

/**
 * Chat history and drafted actions. Written only here, with the secret key (clients have no write
 * rights), and always scoped to the session user — so stored tool results can be trusted on replay.
 */

export const MAX_TURNS = 30;
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** Block types we store and replay. Anything else in a stored row is a bug → the row is dropped. */
const storedBlockSchema = z
  .object({ type: z.enum(["text", "thinking", "redacted_thinking", "tool_use", "tool_result", "fallback"]) })
  .loose();
const storedRowSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.array(storedBlockSchema).min(1), ui: z.array(z.unknown()) });

export type Thread = { id: string; turnCount: number; messages: BetaMessageParam[] };

export async function createThread(userId: string, context: PageContext): Promise<string> {
  const { data, error } = await createAdminClient().from("assistant_threads").insert({ user_id: userId, context }).select("id").single();
  if (error || !data) throw new Error(`thread create failed (${error?.code})`);
  return data.id as string;
}

export async function loadThread(userId: string, threadId: string): Promise<Thread | null> {
  const db = createAdminClient();
  const { data: thread } = await db.from("assistant_threads").select("id, turn_count").eq("id", threadId).eq("user_id", userId).maybeSingle();
  if (!thread) return null;
  const { data: rows, error } = await db
    .from("assistant_messages")
    .select("role, content, ui")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .order("seq")
    .limit(400);
  if (error) throw new Error(`thread read failed (${error.code})`);
  const messages: BetaMessageParam[] = [];
  for (const row of rows ?? []) {
    const parsed = storedRowSchema.safeParse(row);
    if (!parsed.success) throw new Error("stored message malformed");
    messages.push({ role: parsed.data.role, content: parsed.data.content as unknown as BetaContentBlockParam[] });
  }
  return { id: thread.id as string, turnCount: thread.turn_count as number, messages };
}

/** Appends this turn's messages (never edits earlier ones) and counts the turn. */
export async function appendTurn(userId: string, threadId: string, rows: Array<{ message: BetaMessageParam; ui: UiBlock[] }>): Promise<void> {
  if (rows.length === 0) return;
  const db = createAdminClient();
  const { data: last } = await db.from("assistant_messages").select("seq").eq("thread_id", threadId).order("seq", { ascending: false }).limit(1).maybeSingle();
  let seq = ((last?.seq as number | undefined) ?? 0) + 1;
  const { error } = await db.from("assistant_messages").insert(
    rows.map((r) => ({ thread_id: threadId, user_id: userId, seq: seq++, role: r.message.role, content: r.message.content, ui: r.ui })),
  );
  if (error) throw new Error(`thread append failed (${error.code})`);
  const { data: t } = await db.from("assistant_threads").select("turn_count").eq("id", threadId).eq("user_id", userId).single();
  await db
    .from("assistant_threads")
    .update({ turn_count: Math.min(MAX_TURNS, ((t?.turn_count as number) ?? 0) + 1), updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);
}

/** What to show when the panel reopens: plain text and cards, no tool internals. */
export async function loadDisplayHistory(userId: string, threadId: string): Promise<Array<{ role: "user" | "assistant"; text: string; blocks: UiBlock[] }> | null> {
  const thread = await loadThread(userId, threadId);
  if (!thread) return null;
  const { data } = await createAdminClient().from("assistant_messages").select("role, content, ui").eq("thread_id", threadId).eq("user_id", userId).order("seq").limit(400);
  const out: Array<{ role: "user" | "assistant"; text: string; blocks: UiBlock[] }> = [];
  for (const row of data ?? []) {
    const content = (row.content as Array<{ type: string; text?: string }>) ?? [];
    // User turns: the last text block is what the guest typed (the first is <verified_context>).
    const texts = content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text as string);
    const text = row.role === "user" ? (texts.at(-1) ?? "") : texts.join("\n").trim();
    const blocks = ((row.ui as unknown[]) ?? []).flatMap((b) => {
      const p = uiBlockSchema.safeParse(b);
      return p.success ? [p.data] : [];
    });
    if (row.role === "user" && content.every((b) => b.type === "tool_result")) continue;
    if (!text && blocks.length === 0) continue;
    out.push({ role: row.role as "user" | "assistant", text, blocks });
  }
  return out;
}

export type DraftInput =
  | { type: "check_in"; payload: { arrival_time: string; notes: string | null } }
  | { type: "guest_request"; payload: { type: string; details: string | null } };

/** A pending action the guest must confirm. Older pending drafts of the same kind are cancelled. */
export async function createDraft(userId: string, bookingId: string, threadId: string | null, draft: DraftInput): Promise<{ id: string; expiresAt: string }> {
  const db = createAdminClient();
  const stale = db.from("assistant_actions").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("user_id", userId).eq("booking_id", bookingId).eq("type", draft.type).eq("status", "pending");
  await (draft.type === "guest_request" ? stale.eq("payload->>type", draft.payload.type) : stale);
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
  const { data, error } = await db
    .from("assistant_actions")
    .insert({ user_id: userId, booking_id: bookingId, thread_id: threadId, type: draft.type, payload: draft.payload, expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !data) throw new Error(`draft create failed (${error?.code})`);
  return { id: data.id as string, expiresAt };
}

/** Drafts the guest decided on since a moment (told to the model in the next turn). */
export async function actionsDecidedSince(userId: string, threadId: string, since: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("assistant_actions")
    .select("id, type, status, payload")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .gte("decided_at", since)
    .limit(10);
  return (data ?? []).map((a) => `${a.type}${a.type === "guest_request" ? ` (${(a.payload as { type?: string }).type})` : ""}: ${a.status}`);
}

export async function lastTurnAt(userId: string, threadId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("assistant_messages").select("created_at").eq("thread_id", threadId).eq("user_id", userId).order("seq", { ascending: false }).limit(1).maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}
