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
export function boardLabel(code: string, fallback?: string | null): string {
  const base = code.toUpperCase().replace(/\d+$/, ""); // BB2 → BB
  return LABELS[base] ?? fallback?.trim() ?? "Умови харчування уточнюйте в готелі";
}

export function includesBreakfast(code: string): boolean {
  return WITH_BREAKFAST.has(code.toUpperCase().replace(/\d+$/, ""));
}
