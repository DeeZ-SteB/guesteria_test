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

const LITEAPI_DATA_HOST = "https://api.liteapi.travel/v3.0";
const LITEAPI_BOOK_HOST = "https://book.liteapi.travel/v3.0";

/**
 * LiteAPI hosts. E2E tests may point them at a local mock (LITEAPI_MOCK_ORIGIN): loopback http only
 * and never on Vercel, so the API key can never be sent to another host through configuration.
 */
export function liteApiHosts(): { data: string; book: string } {
  const raw = process.env.LITEAPI_MOCK_ORIGIN;
  if (!raw) return { data: LITEAPI_DATA_HOST, book: LITEAPI_BOOK_HOST };
  if (process.env.VERCEL) throw new LiteApiConfigError();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LiteApiConfigError();
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password) throw new LiteApiConfigError();
  return { data: `${url.origin}/data/v3.0`, book: `${url.origin}/book/v3.0` };
}
