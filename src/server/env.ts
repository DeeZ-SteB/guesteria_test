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

/** Supabase secret (service) key. Only src/server/db/admin.ts may use it. */
export function supabaseSecretKey(): string {
  const parsed = z.string().min(20).safeParse(process.env.SUPABASE_SECRET_KEY);
  if (!parsed.success) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return parsed.data;
}
