// Curated destinations for the search autocomplete. `cityName` must match LiteAPI exactly;
// spellings are verified against the sandbox (note the ʼ U+02BC in some Ukrainian names) with `node --env-file=.env scripts/check-cities.mjs`.
// Plain erasable TypeScript with no imports, so Node can load it directly in scripts.

export type City = {
  id: string;
  nameUk: string;
  countryUk: string;
  cityName: string;
  countryCode: string;
  popular?: boolean;
};

export const CITIES: readonly City[] = [
  { id: "lviv", nameUk: "Львів", countryUk: "Україна", cityName: "Lviv", countryCode: "UA", popular: true },
  { id: "kyiv", nameUk: "Київ", countryUk: "Україна", cityName: "Kyiv", countryCode: "UA", popular: true },
  { id: "odesa", nameUk: "Одеса", countryUk: "Україна", cityName: "Odesa", countryCode: "UA" },
  { id: "kharkiv", nameUk: "Харків", countryUk: "Україна", cityName: "Kharkiv", countryCode: "UA" },
  { id: "dnipro", nameUk: "Дніпро", countryUk: "Україна", cityName: "Dnipro", countryCode: "UA" },
  { id: "ivano-frankivsk", nameUk: "Івано-Франківськ", countryUk: "Україна", cityName: "Ivano-Frankivsʼk", countryCode: "UA" },
  { id: "uzhhorod", nameUk: "Ужгород", countryUk: "Україна", cityName: "Uzhhorod", countryCode: "UA" },
  { id: "chernivtsi", nameUk: "Чернівці", countryUk: "Україна", cityName: "Chernivtsi", countryCode: "UA" },
  { id: "truskavets", nameUk: "Трускавець", countryUk: "Україна", cityName: "Truskavets", countryCode: "UA" },
  { id: "vinnytsia", nameUk: "Вінниця", countryUk: "Україна", cityName: "Vinnytsya", countryCode: "UA" },
  { id: "ternopil", nameUk: "Тернопіль", countryUk: "Україна", cityName: "Ternopilʼ", countryCode: "UA" },
  { id: "warsaw", nameUk: "Варшава", countryUk: "Польща", cityName: "Warsaw", countryCode: "PL", popular: true },
  { id: "krakow", nameUk: "Краків", countryUk: "Польща", cityName: "Krakow", countryCode: "PL" },
  { id: "gdansk", nameUk: "Гданськ", countryUk: "Польща", cityName: "Gdansk", countryCode: "PL" },
  { id: "prague", nameUk: "Прага", countryUk: "Чехія", cityName: "Prague", countryCode: "CZ", popular: true },
  { id: "vienna", nameUk: "Відень", countryUk: "Австрія", cityName: "Vienna", countryCode: "AT" },
  { id: "budapest", nameUk: "Будапешт", countryUk: "Угорщина", cityName: "Budapest", countryCode: "HU" },
  { id: "berlin", nameUk: "Берлін", countryUk: "Німеччина", cityName: "Berlin", countryCode: "DE" },
  { id: "munich", nameUk: "Мюнхен", countryUk: "Німеччина", cityName: "Munich", countryCode: "DE" },
  { id: "paris", nameUk: "Париж", countryUk: "Франція", cityName: "Paris", countryCode: "FR", popular: true },
  { id: "nice", nameUk: "Ніцца", countryUk: "Франція", cityName: "Nice", countryCode: "FR" },
  { id: "rome", nameUk: "Рим", countryUk: "Італія", cityName: "Rome", countryCode: "IT", popular: true },
  { id: "milan", nameUk: "Мілан", countryUk: "Італія", cityName: "Milan", countryCode: "IT" },
  { id: "venice", nameUk: "Венеція", countryUk: "Італія", cityName: "Venice", countryCode: "IT" },
  { id: "florence", nameUk: "Флоренція", countryUk: "Італія", cityName: "Florence", countryCode: "IT" },
  { id: "barcelona", nameUk: "Барселона", countryUk: "Іспанія", cityName: "Barcelona", countryCode: "ES", popular: true },
  { id: "madrid", nameUk: "Мадрид", countryUk: "Іспанія", cityName: "Madrid", countryCode: "ES" },
  { id: "lisbon", nameUk: "Лісабон", countryUk: "Португалія", cityName: "Lisbon", countryCode: "PT" },
  { id: "amsterdam", nameUk: "Амстердам", countryUk: "Нідерланди", cityName: "Amsterdam", countryCode: "NL" },
  { id: "london", nameUk: "Лондон", countryUk: "Велика Британія", cityName: "London", countryCode: "GB" },
  { id: "copenhagen", nameUk: "Копенгаген", countryUk: "Данія", cityName: "Copenhagen", countryCode: "DK" },
  { id: "vilnius", nameUk: "Вільнюс", countryUk: "Литва", cityName: "Vilnius", countryCode: "LT" },
  { id: "riga", nameUk: "Рига", countryUk: "Латвія", cityName: "Riga", countryCode: "LV" },
  { id: "tallinn", nameUk: "Таллінн", countryUk: "Естонія", cityName: "Tallinn", countryCode: "EE" },
  { id: "bucharest", nameUk: "Бухарест", countryUk: "Румунія", cityName: "Bucharest", countryCode: "RO" },
  { id: "athens", nameUk: "Афіни", countryUk: "Греція", cityName: "Athens", countryCode: "GR" },
  { id: "istanbul", nameUk: "Стамбул", countryUk: "Туреччина", cityName: "Istanbul", countryCode: "TR" },
  { id: "antalya", nameUk: "Анталія", countryUk: "Туреччина", cityName: "Antalya", countryCode: "TR" },
  { id: "dubrovnik", nameUk: "Дубровник", countryUk: "Хорватія", cityName: "Dubrovnik", countryCode: "HR" },
  { id: "dubai", nameUk: "Дубай", countryUk: "ОАЕ", cityName: "Dubai", countryCode: "AE" },
];

export function findCity(id: string): City | undefined {
  return CITIES.find((city) => city.id === id);
}

function normalise(text: string): string {
  return text.toLocaleLowerCase("uk").replace(/['ʼ’`]/g, "").replace(/\s+/g, " ").trim();
}

/** Exact name typed by the guest ("Львів", "lviv", "Львів, Україна") → city, or undefined. */
export function findCityByName(text: string): City | undefined {
  const q = normalise(text.split(",")[0] ?? "");
  if (!q) return undefined;
  return CITIES.find((city) => normalise(city.nameUk) === q || normalise(city.cityName) === q);
}

/** Autocomplete: Ukrainian or English name, prefix matches first. */
export function searchCities(query: string, limit = 8): City[] {
  const q = normalise(query);
  if (!q) return CITIES.filter((c) => c.popular).slice(0, limit);
  const scored = CITIES.flatMap((city) => {
    const names = [normalise(city.nameUk), normalise(city.cityName)];
    if (names.some((n) => n.startsWith(q))) return [{ city, score: 0 }];
    if (names.some((n) => n.includes(q))) return [{ city, score: 1 }];
    return [];
  });
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.city);
}
