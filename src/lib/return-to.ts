// Checkout links carry a ~1.2k-char offer token; the structural checks below are what keep this safe.
const MAX_LENGTH = 2048;
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
  const result = `${url.pathname}${url.search}${url.hash}`;

  // Normalisation (dot segments, backslashes) can produce "//host" from a safe-looking input,
  // so validate the final value too, not only the raw one.
  if (!isSamePath(result)) return fallback;
  return result;
}

function isSamePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

const EMAIL_MAX = 512;

/**
 * Return path for links sent by email (sign-up confirmation). A checkout link carries a
 * ~1.2k-char offer token that has no business in a mailbox and may exceed provider limits,
 * so it is replaced by the hotel page for the same stay, where the guest can pick a room again.
 */
export function emailSafeReturnPath(raw: unknown): string {
  const safe = safeReturnTo(raw);
  const url = new URL(safe, "http://guesteria.invalid");
  if (url.pathname === "/checkout") {
    const hotel = url.searchParams.get("hotel");
    if (!hotel || !/^[a-z0-9]{3,32}$/i.test(hotel)) return "/";
    const stay = new URLSearchParams();
    for (const key of ["checkin", "checkout", "adults"]) {
      const value = url.searchParams.get(key);
      if (value) stay.set(key, value);
    }
    return safeReturnTo(`/hotels/${hotel}?${stay}`);
  }
  return safe.length <= EMAIL_MAX ? safe : "/";
}
