import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/server/db/admin";
import { checkoutSecret } from "@/server/env";

/** Limits in one place (SPEC §6.5, §17). Windows in seconds. */
export const LIMITS = {
  assistantUser: { limit: 30, window: 3600 },
  assistantIp: { limit: 30, window: 3600 },
  actionUser: { limit: 20, window: 3600 },
  prebookUser: { limit: 30, window: 3600 },
  prebookAll: { limit: 1000, window: 86_400 },
  bookUserHour: { limit: 5, window: 3600 },
  bookUserDay: { limit: 10, window: 86_400 },
  bookAll: { limit: 100, window: 86_400 },
  cancelUser: { limit: 10, window: 3600 },
  // Model calls per day (cost guard); the actual numbers come from env (assistantCaps).
  aiAll: { limit: 2000, window: 86_400 },
  aiAnon: { limit: 600, window: 86_400 },
  // One account cannot use the whole day's budget.
  aiUserDay: { limit: 150, window: 86_400 },
  contextUser: { limit: 120, window: 3600 },
} as const;

export type LimitName = keyof typeof LIMITS;
export type HitResult = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Counts one hit. Fails CLOSED: if the counter is unavailable the request is refused, because the
 * limits exist to cap spending. Counters are writable only with the secret key (service role).
 */
export async function hit(name: LimitName, subject: string, override?: { limit: number; window: number }): Promise<HitResult> {
  const { limit, window } = override ?? LIMITS[name];
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: `${name}:${subject}`.slice(0, 200), p_limit: limit, p_window_seconds: window });
    if (error || typeof data !== "object" || data === null) return { allowed: false, retryAfter: 60 };
    const r = data as { allowed?: unknown; retry_after?: unknown };
    if (r.allowed === true) return { allowed: true };
    return { allowed: false, retryAfter: typeof r.retry_after === "number" ? r.retry_after : 60 };
  } catch {
    return { allowed: false, retryAfter: 60 };
  }
}

/**
 * Several limits in order (put per-user limits before shared ones). Stops at the first refusal, so
 * someone already over their own limit never consumes a shared counter.
 */
export async function hitAll(checks: Array<[LimitName, string]>): Promise<HitResult> {
  for (const [name, subject] of checks) {
    const r = await hit(name, subject);
    if (!r.allowed) return r;
  }
  return { allowed: true };
}

/** First 64 bits of an IPv6 address (expanded first, so compressed forms group correctly). */
function ipv6Prefix(ip: string): string {
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (v4 && ip.toLowerCase().startsWith("::ffff:")) return v4[1];
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return full.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * Anonymous visitor key. x-forwarded-for is trusted only on Vercel, which overwrites it;
 * elsewhere it is spoofable, so all anonymous visitors share one bucket. IPv6 grouped by /64.
 * Raw IPs are never stored (HMAC).
 */
export function ipKey(headers: Headers, env: { vercel: boolean } = { vercel: process.env.VERCEL === "1" }): string {
  if (!env.vercel) return "local";
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!first) return "unknown";
  const ip = first.includes(":") ? ipv6Prefix(first) : first;
  try {
    return createHmac("sha256", checkoutSecret()).update(`rl-ip:${ip}`).digest("hex").slice(0, 32);
  } catch {
    return "unknown"; // misconfigured secret: shared bucket rather than a 500
  }
}

export const kyivDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(now);
