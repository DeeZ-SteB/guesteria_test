import { z } from "zod";

/**
 * LiteAPI offer token: base64url, 976–1236 chars in sandbox (probed). Not secret — any visitor
 * gets one for any search — and prebook validates it server-side, which is also the source of
 * the price. We only check the shape so it can't smuggle anything into a URL.
 */
export const offerIdSchema = z.string().regex(/^[A-Za-z0-9_=-]{16,2000}$/);
