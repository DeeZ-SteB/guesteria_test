// LiteAPI board codes. Real sandbox data uses "BI" for breakfast, docs also list "BB".
const LABELS: Record<string, string> = {
  RO: "Без харчування",
  BB: "Сніданок включено",
  BI: "Сніданок включено",
  HB: "Напівпансіон",
  BD: "Сніданок і вечеря",
  FB: "Повний пансіон",
  AI: "Все включено",
  TI: "Все включено",
};

const WITH_BREAKFAST = new Set(["BB", "BI", "HB", "BD", "BL", "FB", "AI", "TI"]);

/** Ukrainian label for a board code; falls back to the supplier's own name. */
const UNKNOWN = "Умови харчування уточнюйте в готелі";
const baseCode = (code: string) => code.toUpperCase().replace(/\d+$/, ""); // BB2 → BB

export function boardLabel(code: string | null | undefined, fallback?: string | null): string {
  return (code && LABELS[baseCode(code)]) || fallback?.trim() || UNKNOWN;
}

export function includesBreakfast(code: string | null | undefined): boolean {
  return !!code && WITH_BREAKFAST.has(baseCode(code));
}
