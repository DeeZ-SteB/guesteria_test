/** The only host LiteAPI serves hotel photos from (verified in sandbox). Shared with next.config.ts. */
export const IMAGE_HOST = "static.cupid.travel";
/** Exact prefix; the database CHECK on favorites.hotel_image uses the same rule. */
export const IMAGE_PREFIX = `https://${IMAGE_HOST}/`;

/**
 * Strict on the *raw* string (not a normalised URL), so this, next/image and the DB check
 * all agree: exact https host, no port, no userinfo, no backslashes.
 */
export function isAllowedImageUrl(url: string | null | undefined): url is string {
  if (!url || !url.startsWith(IMAGE_PREFIX) || url.includes("\\")) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === IMAGE_HOST && !parsed.port && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
