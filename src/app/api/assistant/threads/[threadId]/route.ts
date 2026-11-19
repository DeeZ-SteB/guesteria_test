import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { loadDisplayHistory } from "@/server/assistant/store";

/** The current thread for re-opening the panel: text and cards only (no tool internals). */
export async function GET(_request: Request, ctx: RouteContext<"/api/assistant/threads/[threadId]">): Promise<Response> {
  const id = z.uuid().safeParse((await ctx.params).threadId);
  const user = await getCurrentUser();
  if (!id.success || !user) return Response.json({ messages: null }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const messages = await loadDisplayHistory(user.id, id.data).catch(() => null);
  return Response.json({ messages }, { status: messages ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
