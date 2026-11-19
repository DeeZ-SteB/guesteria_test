import "server-only";

/** Observability without personal data: never message text, tool arguments, user/booking ids or IPs. */
export type StepLog = {
  requestId: string;
  kind: "anon" | "user";
  step: number;
  model?: string;
  stopReason?: string | null;
  refusalCategory?: string | null;
  fallback?: boolean;
  usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  tools?: string[];
  error?: string;
  latencyMs: number;
};

export function logStep(s: StepLog): void {
  console.info(
    JSON.stringify({
      at: "assistant.step",
      req: s.requestId,
      kind: s.kind,
      step: s.step,
      model: s.model,
      stop: s.stopReason,
      refusal: s.refusalCategory ?? undefined,
      fallback: s.fallback || undefined,
      in: s.usage?.input_tokens ?? undefined,
      out: s.usage?.output_tokens ?? undefined,
      cache_read: s.usage?.cache_read_input_tokens ?? undefined,
      cache_write: s.usage?.cache_creation_input_tokens ?? undefined,
      tools: s.tools?.length ? s.tools : undefined,
      error: s.error,
      ms: s.latencyMs,
    }),
  );
}
