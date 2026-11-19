import { nightsBetween } from "./stay";

/** What the trip page may do with a booking (Kyiv dates). */
export type TripMode = "pending" | "active" | "past" | "cancelled";

export function tripMode(b: { status: "pending" | "confirmed" | "cancelled"; checkOut: string }, today: string): TripMode {
  if (b.status === "pending") return "pending";
  if (b.status === "cancelled") return "cancelled";
  return b.checkOut >= today ? "active" : "past";
}

/** Arrival times in 30-minute steps: "00:00" … "23:30". */
export const ARRIVAL_SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`) as [
  string,
  ...string[],
];

const TIME = /^([01]\d|2[0-3]):([0-5]\d)/;
const minutes = (t: string) => {
  const m = TIME.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** The hotel's check-in time rounded up to a slot; 15:00 when unknown. */
export function defaultArrival(hotelCheckIn: string | null): string {
  const m = hotelCheckIn ? minutes(hotelCheckIn) : null;
  if (m === null) return "15:00";
  const slot = Math.min(47, Math.ceil(m / 30));
  return ARRIVAL_SLOTS[slot];
}

/** Arriving before the hotel's check-in time → suggest an early check-in request. */
export function isEarlierThan(arrival: string, hotelCheckIn: string | null): boolean {
  const a = minutes(arrival);
  const h = hotelCheckIn ? minutes(hotelCheckIn) : null;
  return a !== null && h !== null && a < h;
}

type Stay = { status: "pending" | "confirmed" | "cancelled"; checkIn: string; checkOut: string };

/** Check-in can be done or changed until the end of the arrival day. */
export function checkinEligibility(b: Stay, today: string): { ok: true } | { ok: false; reason: "not_confirmed" | "too_late" } {
  if (b.status !== "confirmed") return { ok: false, reason: "not_confirmed" };
  if (b.checkIn < today) return { ok: false, reason: "too_late" };
  return { ok: true };
}

export const REQUEST_TYPES = ["early_check_in", "late_check_out", "transfer", "breakfast", "other"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestStatus = "sent" | "confirmed" | "declined";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  early_check_in: "Ранній заїзд",
  late_check_out: "Пізній виїзд",
  transfer: "Трансфер",
  breakfast: "Сніданок у номер",
  other: "Інше",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  sent: "Надіслано",
  confirmed: "Підтверджено",
  declined: "Відхилено",
};

/** Details are needed where the hotel cannot act without them. */
export const DETAILS_REQUIRED: ReadonlySet<RequestType> = new Set(["transfer", "other"]);

/** Requests while the stay has not ended. */
export function requestEligibility(b: Stay, today: string): { ok: true } | { ok: false; reason: "not_confirmed" | "ended" } {
  if (b.status !== "confirmed") return { ok: false, reason: "not_confirmed" };
  if (b.checkOut < today) return { ok: false, reason: "ended" };
  return { ok: true };
}

/** Per-type window on top of requestEligibility: an early check-in makes no sense after arrival day. */
export function requestTypeAvailable(type: RequestType, b: Stay, today: string): boolean {
  if (!requestEligibility(b, today).ok) return false;
  if (type === "early_check_in") return b.checkIn >= today;
  return true;
}

/** Google Maps route by coordinates, or a search by name and address when coordinates are missing/invalid. */
export function mapsUrl(loc: { lat: number; lng: number } | null, fallbackQuery: string): string {
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180 && !(loc.lat === 0 && loc.lng === 0)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`;
}

export type GuestRequestView = {
  id: string;
  type: RequestType;
  details: string | null;
  status: RequestStatus;
  source: "guest" | "assistant";
  createdAt: string;
  updatedAt: string;
};

/** Merge one row (own insert, Realtime event or refetch): upsert by id, never let an older event win. */
export function applyRequestEvent(list: GuestRequestView[], row: GuestRequestView): GuestRequestView[] {
  const existing = list.find((r) => r.id === row.id);
  if (existing && Date.parse(existing.updatedAt) > Date.parse(row.updatedAt)) return list;
  const next = existing ? list.map((r) => (r.id === row.id ? row : r)) : [row, ...list];
  return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A row deleted on the hotel side (or by a cascade) disappears from the list. */
export function removeRequest(list: GuestRequestView[], id: unknown): GuestRequestView[] {
  return typeof id === "string" ? list.filter((r) => r.id !== id) : list;
}

/** Types with an unanswered request (the DB allows one per type, except "other"). */
export function openTypes(list: GuestRequestView[]): Set<RequestType> {
  return new Set(list.filter((r) => r.status === "sent" && r.type !== "other").map((r) => r.type));
}

export const nightsOf = (b: { checkIn: string; checkOut: string }) => nightsBetween(b.checkIn, b.checkOut);
