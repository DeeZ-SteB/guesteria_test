const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// Control, zero-width and bidi-override characters: invisible to people, but they can hide
// or reorder text (and smuggle instructions into the AI prompt).
export const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Decodes a numeric entity; anything outside valid Unicode becomes U+FFFD instead of throwing. */
function fromCode(code: number): string {
  const valid = Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return valid ? String.fromCodePoint(code) : "\ufffd";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,8});/g, (_, code) => fromCode(Number(code)))
    .replace(/&#x([0-9a-f]{1,8});/gi, (_, code) => fromCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Supplier HTML (hotel descriptions) → plain paragraphs, rendered by React as escaped text.
 * We never inject supplier HTML into the page, and the AI assistant gets text without markup.
 * Note: decoded text may legitimately contain "<" (e.g. "&lt;5 min walk"); it is text, not markup.
 */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ""))
    .replace(INVISIBLE, "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Guest-typed text: invisible/bidi/control characters removed (keeps newlines), trimmed. */
export function cleanUserText(value: string): string {
  return value.replace(new RegExp(INVISIBLE.source, "g"), "").replace(/\r\n?/g, "\n").trim();
}
