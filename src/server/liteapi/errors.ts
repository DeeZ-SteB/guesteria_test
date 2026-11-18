import type { LiteApiErrorKind } from "@/lib/liteapi-messages";

export class LiteApiError extends Error {
  readonly kind: LiteApiErrorKind;
  readonly code?: number;
  readonly httpStatus?: number;
  readonly endpoint: string;

  constructor(kind: LiteApiErrorKind, endpoint: string, opts: { code?: number; httpStatus?: number; cause?: unknown } = {}) {
    super(`LiteAPI ${endpoint}: ${kind}${opts.code ? ` (${opts.code})` : ""}`, { cause: opts.cause });
    this.name = "LiteApiError";
    this.kind = kind;
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.endpoint = endpoint;
  }
}

const INVALID_REQUEST_CODES = new Set([4000, 4002, 4003, 4004, 4005]);
const TIMEOUT_CODES = new Set([4011, 4016]);
const UNAUTHORIZED_CODES = new Set([401, 403, 40302]);

/** Known LiteAPI codes only; null means "decide by HTTP status". */
function kindForCode(code: number): LiteApiErrorKind | null {
  if (code === 2001) return "no_availability";
  if (UNAUTHORIZED_CODES.has(code)) return "unauthorized";
  if (INVALID_REQUEST_CODES.has(code)) return "invalid_request";
  if (TIMEOUT_CODES.has(code)) return "timeout";
  if (code === 4290 || code === 429) return "upstream";
  if ((code >= 500 && code < 600) || (code >= 5000 && code < 6000)) return "upstream";
  return null;
}

function kindForStatus(status: number): LiteApiErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429 || status >= 500) return "upstream";
  if (status >= 400) return "invalid_request";
  return "unknown"; // e.g. HTTP 200 with an unknown error code
}

/**
 * Returns an error if the response is a failure, else null.
 * LiteAPI can answer HTTP 200 with `{ error: { code: 2001 } }`, so the body is checked first.
 */
export function toLiteApiError(httpStatus: number, body: unknown, endpoint: string): LiteApiError | null {
  if (body && typeof body === "object" && "error" in body && body.error) {
    const raw = (body.error as { code?: unknown }).code;
    const code = typeof raw === "number" ? raw : Number(raw);
    const kind = (Number.isFinite(code) ? kindForCode(code) : null) ?? kindForStatus(httpStatus);
    return new LiteApiError(kind, endpoint, { code: Number.isFinite(code) ? code : undefined, httpStatus });
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return new LiteApiError(kindForStatus(httpStatus), endpoint, { httpStatus });
  }
  return null;
}

/** Maps a thrown fetch/abort failure to a LiteApiError. */
export function fromThrown(error: unknown, endpoint: string): LiteApiError {
  if (error instanceof LiteApiError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return new LiteApiError("timeout", endpoint, { cause: error });
  if (error instanceof TypeError) return new LiteApiError("network", endpoint, { cause: error });
  return new LiteApiError("unknown", endpoint, { cause: error });
}
