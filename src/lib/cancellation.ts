const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const TIME_ZONE = "Europe/Kyiv";

/**
 * LiteAPI cancelTime ("YYYY-MM-DD HH:mm:ss") + timezone → ISO UTC string.
 * Only GMT/UTC are understood; anything else returns null so we never promise
 * a free-cancellation deadline we cannot date correctly.
 */
export function parseCancelTime(cancelTime: string, timezone: string | null | undefined): string | null {
  const tz = (timezone ?? "").trim().toUpperCase();
  if (tz !== "GMT" && tz !== "UTC") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(cancelTime.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s = "00"] = match;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** "6 гру, 12:00" in Kyiv time. */
export function formatKyivDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${Number(get("day"))} ${MONTHS[Number(get("month")) - 1]}, ${get("hour")}:${get("minute")}`;
}

/** Shown under a rate: free-cancellation deadline or "non-refundable". */
export function cancellationText(freeCancellationUntil: string | null, now: Date = new Date()): string {
  if (!freeCancellationUntil || new Date(freeCancellationUntil) <= now) return "Без повернення коштів";
  return `Безкоштовне скасування до ${formatKyivDateTime(freeCancellationUntil)}`;
}
