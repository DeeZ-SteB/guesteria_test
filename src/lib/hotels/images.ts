/** The only host LiteAPI serves hotel photos from (verified in sandbox). Shared with next.config.ts. */
export const IMAGE_HOST = "static.cupid.travel";

export function isAllowedImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === IMAGE_HOST && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
