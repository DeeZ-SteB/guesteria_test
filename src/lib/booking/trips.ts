import { nightsBetween, todayInKyiv } from "./stay";
import { pluralUk } from "@/lib/format";

/** What the cabinet needs about a booking. Never carries client_reference or prebook ids. */
export type TripRow = {
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  hotelId: string;
  hotelName: string;
  hotelImage: string | null;
  city: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  roomName: string;
  totalAmount: number;
  currency: string;
  refundable: boolean;
  refundableUntil: string | null;
  hasLiteApiId: boolean;
  /** Computed on the server with one clock (the action re-checks anyway). */
  cancellable: boolean;
  /** Online check-in done; undefined when unknown (then no badge). */
  checkedIn?: boolean;
};

export type TripGroups = { upcoming: TripRow[]; past: TripRow[]; cancelled: TripRow[] };

/**
 * Upcoming includes stays in progress and the check-out day itself (the guest is still there).
 * Dates are compared as ISO strings against today's date in Kyiv.
 */
export function groupTrips(rows: TripRow[], today: string): TripGroups {
  const upcoming: TripRow[] = [];
  const past: TripRow[] = [];
  const cancelled: TripRow[] = [];
  for (const row of rows) {
    if (row.status === "cancelled") cancelled.push(row);
    else if (row.checkOut >= today) upcoming.push(row);
    else past.push(row);
  }
  upcoming.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return a.checkIn.localeCompare(b.checkIn);
  });
  past.sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  cancelled.sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  return { upcoming, past, cancelled };
}

export type TripBadge = { kind: "in_days"; days: number } | { kind: "today" } | { kind: "ongoing" } | { kind: "processing" };

/** Badge for one card. `nearestId` = the first confirmed upcoming trip (only it gets a countdown). */
export function tripBadge(row: TripRow, today: string, nearestId: string | null): TripBadge | null {
  if (row.status === "pending") return { kind: "processing" };
  if (row.status !== "confirmed" || row.checkOut < today) return null;
  if (row.checkIn === today) return { kind: "today" };
  if (row.checkIn < today) return { kind: "ongoing" };
  if (row.id !== nearestId) return null;
  return { kind: "in_days", days: nightsBetween(today, row.checkIn) };
}

export function tripBadgeText(b: TripBadge): string {
  switch (b.kind) {
    case "in_days":
      return b.days === 1 ? "Завтра" : `Через ${b.days} ${pluralUk(b.days, ["день", "дні", "днів"])}`;
    case "today":
      return "Заїзд сьогодні";
    case "ongoing":
      return "Ви зараз тут";
    case "processing":
      return "Перевірте статус";
  }
}

export function nearestTripId(upcoming: TripRow[], today: string): string | null {
  return upcoming.find((t) => t.status === "confirmed" && t.checkIn > today)?.id ?? null;
}

/** A request sent just before the deadline must not land after it and be charged. */
export const CANCEL_MARGIN_MS = 10 * 60 * 1000;

export type CancelBlock = "not_confirmed" | "no_liteapi_id" | "non_refundable" | "deadline_passed" | "stay_started";
export type CancelEligibility = { ok: true } | { ok: false; reason: CancelBlock };

export type Cancellable = Pick<TripRow, "status" | "checkIn" | "refundable" | "refundableUntil" | "hasLiteApiId">;

/** Only free cancellation is self-service; anything that may cost money goes to support. */
export function cancelEligibility(row: Cancellable, now: Date): CancelEligibility {
  if (row.status !== "confirmed") return { ok: false, reason: "not_confirmed" };
  if (!row.hasLiteApiId) return { ok: false, reason: "no_liteapi_id" };
  if (!row.refundable) return { ok: false, reason: "non_refundable" };
  if (row.checkIn <= todayInKyiv(now)) return { ok: false, reason: "stay_started" };
  if (row.refundableUntil !== null) {
    const deadline = Date.parse(row.refundableUntil);
    if (!Number.isFinite(deadline) || now.getTime() >= deadline - CANCEL_MARGIN_MS) return { ok: false, reason: "deadline_passed" };
  }
  return { ok: true };
}

const REASON_TEXT: Record<CancelBlock, string> = {
  not_confirmed: "Бронювання ще не підтверджене — скасувати можна після підтвердження.",
  no_liteapi_id: "Бронювання ще обробляється. Спробуйте трохи пізніше.",
  non_refundable: "Тариф без повернення коштів — скасування лише через підтримку.",
  deadline_passed: "Термін безкоштовного скасування минув — зверніться до підтримки.",
  stay_started: "Проживання вже почалося — зверніться до готелю або підтримки.",
};

export const cancelReasonText = (reason: CancelBlock) => REASON_TEXT[reason];
