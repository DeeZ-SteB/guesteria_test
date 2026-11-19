import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { checkoutSecret } from "@/server/env";

/**
 * Signed checkout token (hidden form field). It binds the quote shown on the page to the user
 * and the prebook, so the confirm action needs no database round-trip and cannot be replayed by
 * someone else. Contains only the public price — never our net cost.
 */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

const payloadSchema = z.object({
  v: z.literal(1),
  uid: z.uuid(),
  pid: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  hid: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  ci: z.iso.date(),
  co: z.iso.date(),
  ad: z.number().int().min(1).max(8),
  occ: z.number().int().min(1),
  amt: z.number().nonnegative(),
  cur: z.string().regex(/^[A-Z]{3}$/),
  room: z.string().min(1).max(200),
  board: z.string().regex(/^[A-Z0-9]{1,8}$/).nullable(),
  city: z.string().regex(/^[a-z-]{1,64}$/).nullable(),
  img: z.string().max(500).nullable(),
  name: z.string().min(1).max(200),
  /** Cancellation terms the guest saw (prebook): refundable + deadline. */
  rf: z.boolean(),
  until: z.iso.datetime().nullable(),
  exp: z.number().int(),
});
export type CheckoutPayload = z.infer<typeof payloadSchema>;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string) => createHmac("sha256", checkoutSecret()).update(data).digest("base64url");

/**
 * Signs a quote. Validates with the same schema as verification, so a value the verifier would
 * reject (e.g. an odd prebook id) fails here — at page render — not on every submit.
 * Returns null when the quote can't be signed.
 */
export function signCheckoutToken(payload: Omit<CheckoutPayload, "v" | "exp">, now = Date.now()): string | null {
  const parsed = payloadSchema.safeParse({ v: 1, ...payload, exp: now + TOKEN_TTL_MS });
  if (!parsed.success) return null;
  const body = b64(JSON.stringify(parsed.data));
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: CheckoutPayload; expired: boolean }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * `allowExpired`: an expired but authentic token may still *resolve* an existing attempt
 * (the caller must never start a new booking with it).
 */
export function verifyCheckoutToken(token: unknown, now = Date.now(), opts: { allowExpired?: boolean } = {}): VerifyResult {
  if (typeof token !== "string" || token.length > 4000) return { ok: false, reason: "invalid" };
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  // HMAC first: nothing from an unsigned body is parsed.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const expired = parsed.data.exp < now;
  if (expired && !opts.allowExpired) return { ok: false, reason: "expired" };
  return { ok: true, payload: parsed.data, expired };
}

/**
 * Deterministic per user + prebook: double submits, the back button and retries all send the
 * same reference, and LiteAPI refuses a second booking with it (4005, verified in sandbox).
 */
export function clientReferenceFor(userId: string, prebookId: string): string {
  return `gs-${createHmac("sha256", checkoutSecret()).update(`ref|${userId}|${prebookId}`).digest("hex").slice(0, 24)}`;
}
