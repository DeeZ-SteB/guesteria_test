import "server-only";
import { z } from "zod";

const demoSchema = z.object({
  DEMO_EMAIL: z.email(),
  DEMO_PASSWORD: z.string().min(8),
});

/** Demo account credentials, or null when the demo login is not configured. Never sent to the client. */
export function demoCredentials(): { email: string; password: string } | null {
  const parsed = demoSchema.safeParse(process.env);
  if (!parsed.success) return null;
  return { email: parsed.data.DEMO_EMAIL, password: parsed.data.DEMO_PASSWORD };
}

export class LiteApiConfigError extends Error {
  constructor() {
    super("LITEAPI_KEY is not configured");
    this.name = "LiteApiConfigError";
  }
}

/** LiteAPI key (server-only). Throws without revealing any value when missing. */
export function liteApiKey(): string {
  const parsed = z.string().min(10).safeParse(process.env.LITEAPI_KEY);
  if (!parsed.success) throw new LiteApiConfigError();
  return parsed.data;
}

/** HMAC key for checkout tokens and client references. Throws without revealing anything. */
export function checkoutSecret(): string {
  const parsed = z.string().min(32).safeParse(process.env.CHECKOUT_SECRET);
  if (!parsed.success) throw new Error("CHECKOUT_SECRET is not configured");
  return parsed.data;
}

/** Anthropic API key (server-only). Throws without revealing any value. */
export function anthropicKey(): string {
  const parsed = z.string().min(20).safeParse(process.env.ANTHROPIC_API_KEY);
  if (!parsed.success) throw new Error("ANTHROPIC_API_KEY is not configured");
  return parsed.data;
}

const capSchema = (fallback: number) => z.coerce.number().int().min(0).max(1_000_000).catch(fallback);

/** Cost guard: model calls per day for everyone / for anonymous visitors. */
export function assistantCaps(): { daily: number; anonDaily: number } {
  return {
    daily: capSchema(2000).parse(process.env.ASSISTANT_DAILY_CAP ?? 2000),
    anonDaily: capSchema(600).parse(process.env.ASSISTANT_ANON_DAILY_CAP ?? 600),
  };
}
