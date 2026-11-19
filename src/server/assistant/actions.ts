import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedUser } from "@/server/auth";
import { hit } from "@/server/rate-limit";

export const actionResultSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "expired", "failed", "not_found", "pending"]),
  reason: z.enum(["closed", "invalid", "duplicate_open", "limit"]).optional(),
});
export type ActionResult = z.infer<typeof actionResultSchema> | { status: "error"; reason: "session" | "rate_limited" | "retry" };

/**
 * Executes or cancels a draft the assistant prepared — only by the signed-in owner, through the
 * database function that re-checks ownership, status, expiry and the booking rules in one transaction.
 */
export async function decideAction(actionId: string, decision: "confirm" | "cancel"): Promise<ActionResult> {
  const auth = await verifiedUser();
  if (auth.status !== "ok") return { status: "error", reason: "session" };
  const limited = await hit("actionUser", auth.user.id);
  if (!limited.allowed) return { status: "error", reason: "rate_limited" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(decision === "confirm" ? "confirm_assistant_action" : "cancel_assistant_action", { p_action_id: actionId });
  if (error) return { status: "error", reason: "retry" };
  const parsed = actionResultSchema.safeParse(data);
  return parsed.success ? parsed.data : { status: "error", reason: "retry" };
}
