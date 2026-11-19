"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatDateRange } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { cancellationText } from "@/lib/cancellation";
import { cancelReasonText, type TripRow } from "@/lib/booking/trips";
import { cancelTrip, type CancelTripResult } from "../actions";

function resultText(r: Extract<CancelTripResult, { ok: false }>["reason"]): string {
  switch (r) {
    case "liteapi_failed":
      return "Не вдалося скасувати. Спробуйте ще раз.";
    case "unknown_outcome":
      return "Не вдалося перевірити результат. Оновіть сторінку за хвилину — повторне скасування безпечне.";
    case "save_failed":
      return "Бронювання скасовано в готелі, статус тут оновиться після повторної спроби.";
    case "rate_limited":
      return "Забагато спроб. Спробуйте за кілька хвилин.";
    case "retry":
      return "Не вдалося завантажити бронювання. Спробуйте ще раз.";
    case "session":
      return "Сесія завершилась. Увійдіть знову.";
    case "not_found":
    case "invalid":
      return "Бронювання не знайдено.";
    default:
      return cancelReasonText(r);
  }
}

export function CancelSheet({ trip, onClose }: { trip: TripRow | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setMessage(null);
    onClose();
  };

  const confirm = () => {
    if (!trip) return;
    setMessage(null);
    startTransition(async () => {
      const result = await cancelTrip({ bookingId: trip.id });
      if (result.ok && result.state === "cancelled_with_charges") {
        // Never let a charged cancellation look like the promised full refund.
        setMessage("Бронювання скасовано, але готель утримав плату. Зверніться до підтримки — ми розберемося.");
        return;
      }
      if (result.ok) {
        onClose(); // the page refreshes; the trip moves to «Скасовані»
        return;
      }
      setMessage(resultText(result.reason));
    });
  };

  return (
    <Sheet open={trip !== null} onClose={close} title="Скасувати бронювання?" description={trip ? `${trip.hotelName} · ${formatDateRange(trip.checkIn, trip.checkOut)}` : undefined}>
      {trip && (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-success-ink">{cancellationText({ refundable: trip.refundable, freeCancellationUntil: trip.refundableUntil })}</p>
          <p>
            Повернення: <b>{formatMoney({ amount: trip.totalAmount, currency: trip.currency })}</b> (повна сума).
          </p>
          <p className="text-muted">Скасування незворотне: номер повернеться у продаж.</p>
          <p aria-live="polite" role="status" className={message ? "rounded-button bg-danger/10 px-3 py-2 text-danger" : "sr-only"}>
            {message ?? ""}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="danger" size="lg" fullWidth loading={pending} onClick={confirm} className="border-danger bg-danger text-on-danger hover:bg-danger/90 hover:text-on-danger">
              Скасувати бронювання
            </Button>
            <Button variant="ghost" size="lg" fullWidth onClick={close} disabled={pending}>
              Залишити
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
