import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import type { anonHistorySchema } from "@/features/assistant/protocol";
import { neutralizeTags } from "./untrusted";

/**
 * Anonymous history → plain text messages. Only text ever comes from the browser, so tool calls,
 * tool results and thinking cannot be forged. Consecutive same-role items are merged; the first
 * message must be the user's.
 */
export function anonHistoryToMessages(history: z.infer<typeof anonHistorySchema> | undefined): BetaMessageParam[] {
  const out: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const item of history ?? []) {
    const text = neutralizeTags(item.text).trim();
    if (!text) continue;
    if (out.length === 0 && item.role === "assistant") continue;
    const last = out.at(-1);
    if (last && last.role === item.role) last.text += `\n\n${text}`;
    else out.push({ role: item.role, text });
  }
  return out.map((m) => ({ role: m.role, content: [{ type: "text", text: m.text }] }));
}
