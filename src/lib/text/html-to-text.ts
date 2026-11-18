const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z#0-9]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Supplier HTML (hotel descriptions) → plain paragraphs, rendered by React as escaped text.
 * We never inject supplier HTML into the page, and the AI assistant gets text without markup.
 */
export function htmlToParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n");
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ""))
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
