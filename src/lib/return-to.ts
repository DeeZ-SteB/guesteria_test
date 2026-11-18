const MAX_LENGTH = 512;
const INTERNAL_PARAMS = ["auth", "next"];
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Turns an untrusted "return to" value into a same-site path, or `fallback`.
 * Guards every post-login redirect against open-redirect tricks
 * (`//evil.com`, `/\evil.com`, `https://…`, `javascript:` and encoded variants).
 */
export function safeReturnTo(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (CONTROL_CHARS.test(raw)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\") || CONTROL_CHARS.test(decoded)) {
    return fallback;
  }

  const base = "http://guesteria.invalid";
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return fallback;
  }
  if (url.origin !== base) return fallback;

  INTERNAL_PARAMS.forEach((param) => url.searchParams.delete(param));
  return `${url.pathname}${url.search}${url.hash}`;
}
