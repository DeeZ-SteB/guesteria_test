const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

/** Ukrainian plural: [one, few, many] — 1 ніч, 2 ночі, 5 ночей, 11 ночей, 21 ніч. */
export function pluralUk(n: number, [one, few, many]: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

/** "12–15 гру", "30 гру – 2 січ". Our own month names: ICU gives "груд.". */
export function formatDateRange(checkIn: string, checkOut: string): string {
  const a = parts(checkIn);
  const b = parts(checkOut);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]}`;
  return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}`;
}

/** "12 гру, пт" for date fields. */
export function formatShortDate(iso: string): string {
  const { y, m, d } = parts(iso);
  const weekday = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d} ${MONTHS[m - 1]}, ${weekday}`;
}

export const nightsLabel = (n: number) => `${n} ${pluralUk(n, ["ніч", "ночі", "ночей"])}`;
export const adultsLabel = (n: number) => `${n} ${pluralUk(n, ["дорослий", "дорослих", "дорослих"])}`;
export const hotelsFoundLabel = (n: number) =>
  `${pluralUk(n, ["Знайдено", "Знайдено", "Знайдено"])} ${n} ${pluralUk(n, ["готель", "готелі", "готелів"])}`;
export const reviewsLabel = (n: number) =>
  `${new Intl.NumberFormat("uk-UA").format(n)} ${pluralUk(n, ["відгук", "відгуки", "відгуків"])}`;
