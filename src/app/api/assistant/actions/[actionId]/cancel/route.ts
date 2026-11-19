import { z } from "zod";
import { decideAction } from "@/server/assistant/actions";
import { sameOrigin } from "@/server/assistant/http";

/** The guest's own click on «Скасувати» — the model can never call this. */
export async function POST(request: Request, ctx: RouteContext<"/api/assistant/actions/[actionId]/cancel">): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ status: "error", reason: "forbidden" }, { status: 403 });
  const id = z.uuid().safeParse((await ctx.params).actionId);
  if (!id.success) return Response.json({ status: "not_found" }, { status: 404 });
  const result = await decideAction(id.data, "cancel");
  const status = result.status === "not_found" ? 404 : result.status === "error" ? (result.reason === "session" ? 401 : result.reason === "rate_limited" ? 429 : 503) : 200;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
