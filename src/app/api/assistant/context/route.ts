import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { buildTripContext } from "@/server/assistant/context";

/** Free (no model call): proactive suggestions for the trip page greeting. */
export async function GET(request: Request): Promise<Response> {
  const bookingId = z.uuid().safeParse(new URL(request.url).searchParams.get("bookingId"));
  const user = await getCurrentUser();
  if (!bookingId.success || !user) return Response.json({ hints: [] }, { headers: { "Cache-Control": "no-store" } });
  const trip = await buildTripContext(user.id, bookingId.data).catch(() => null);
  return Response.json({ hints: trip?.hints ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
