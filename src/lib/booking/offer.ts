import { z } from "zod";

/**
 * Longest offer token we accept. Sandbox tokens are 976–1236 chars (probed). The cap keeps
 * a full checkout link (token + ~130 chars of params) under the 2048-char return-path limit,
 * so signing in from «Обрати» can never silently drop the guest on the home page.
 */
export const OFFER_ID_MAX = 1900;

/**
 * LiteAPI offer token: base64url. Not secret — any visitor gets one for any search — and
 * prebook validates it server-side, which is also the source of the price. We only check
 * the shape so it can't smuggle anything into a URL.
 */
export const offerIdSchema = z.string().regex(new RegExp(`^[A-Za-z0-9_=-]{16,${OFFER_ID_MAX}}$`));
