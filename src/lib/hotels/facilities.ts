/**
 * Supplier facility names are English free text (sampled from 4 Lviv hotels in sandbox).
 * We translate the common ones and pick the most useful for the "top 8" row.
 * Unknown names are shown as-is rather than hidden.
 */
export type FacilityKey =
  | "wifi" | "parking" | "pool" | "spa" | "fitness" | "restaurant" | "bar" | "breakfast" | "roomService"
  | "airportShuttle" | "aircon" | "frontDesk" | "family" | "pets" | "elevator" | "accessible" | "nonSmoking"
  | "terrace" | "laundry" | "luggage" | "concierge" | "heating" | "safe" | "soundproof" | "meeting" | "security";

type Entry = { key: FacilityKey; labelUk: string };

// Order = priority for the top row.
const ENTRIES: Array<[string[], Entry]> = [
  [["free wifi", "wifi available", "wifi", "free wi-fi", "internet"], { key: "wifi", labelUk: "Wi-Fi" }],
  [["free parking", "parking", "private parking", "parking on site"], { key: "parking", labelUk: "Парковка" }],
  [["swimming pool", "indoor swimming pool", "outdoor swimming pool", "pool"], { key: "pool", labelUk: "Басейн" }],
  [["spa", "spa and wellness centre", "sauna", "wellness centre"], { key: "spa", labelUk: "SPA" }],
  [["fitness facilities", "fitness centre", "gym", "fitness"], { key: "fitness", labelUk: "Фітнес" }],
  [["restaurant"], { key: "restaurant", labelUk: "Ресторан" }],
  [["breakfast in the room", "breakfast"], { key: "breakfast", labelUk: "Сніданок" }],
  [["bar"], { key: "bar", labelUk: "Бар" }],
  [["airport shuttle", "airport shuttle (additional charge)", "airport pick up", "airport drop off", "shuttle service"], { key: "airportShuttle", labelUk: "Трансфер з аеропорту" }],
  [["air conditioning"], { key: "aircon", labelUk: "Кондиціонер" }],
  [["room service", "food delivered to guest room"], { key: "roomService", labelUk: "Обслуговування номерів" }],
  [["24-hour front desk"], { key: "frontDesk", labelUk: "Цілодобова рецепція" }],
  [["family rooms"], { key: "family", labelUk: "Сімейні номери" }],
  [["pets allowed"], { key: "pets", labelUk: "Можна з тваринами" }],
  [["lift / elevator", "elevator", "lift"], { key: "elevator", labelUk: "Ліфт" }],
  [["facilities for disabled guests", "wheelchair accessible"], { key: "accessible", labelUk: "Доступно для людей з інвалідністю" }],
  [["non-smoking rooms"], { key: "nonSmoking", labelUk: "Номери для некурців" }],
  [["terrace"], { key: "terrace", labelUk: "Тераса" }],
  [["laundry", "dry cleaning", "ironing service"], { key: "laundry", labelUk: "Пральня" }],
  [["luggage storage"], { key: "luggage", labelUk: "Камера схову" }],
  [["concierge service"], { key: "concierge", labelUk: "Консьєрж" }],
  [["heating"], { key: "heating", labelUk: "Опалення" }],
  [["safety deposit box"], { key: "safe", labelUk: "Сейф" }],
  [["soundproof rooms"], { key: "soundproof", labelUk: "Звукоізольовані номери" }],
  [["meeting/banquet facilities"], { key: "meeting", labelUk: "Конференц-зал" }],
  [["24-hour security"], { key: "security", labelUk: "Цілодобова охорона" }],
];

const BY_NAME = new Map<string, Entry & { priority: number }>();
ENTRIES.forEach(([names, entry], priority) => names.forEach((n) => BY_NAME.set(n, { ...entry, priority })));

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function translateFacility(name: string): string {
  return BY_NAME.get(norm(name))?.labelUk ?? name.trim();
}

/** Most useful facilities first, one per kind (e.g. "Free WiFi" + "WiFi available" → one Wi-Fi). */
export function topFacilities(names: string[], limit = 8): Array<{ key: FacilityKey; label: string }> {
  const found = new Map<FacilityKey, Entry & { priority: number }>();
  for (const name of names) {
    const entry = BY_NAME.get(norm(name));
    if (entry && !found.has(entry.key)) found.set(entry.key, entry);
  }
  return [...found.values()]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit)
    .map(({ key, labelUk }) => ({ key, label: labelUk }));
}

/** Full list for the sheet: translated, de-duplicated by label, translated ones first. */
export function allFacilities(names: string[]): string[] {
  const seen = new Set<string>();
  const known: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const label = translateFacility(name);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    (BY_NAME.has(norm(name)) ? known : unknown).push(label);
  }
  return [...known, ...unknown];
}
