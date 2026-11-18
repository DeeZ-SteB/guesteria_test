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
