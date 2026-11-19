"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, Clock, X } from "lucide-react";
import { HotelImage } from "@/components/ui/hotel-image";
import { RatingBadge, Stars } from "@/components/ui/rating";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDateRange } from "@/lib/format";
import { cancellationText } from "@/lib/cancellation";
import { cn } from "@/lib/cn";
import type { UiBlock } from "./protocol";

/** Cards inside the chat. Links are internal only (validated by the protocol schema). */
export function ChatBlock({ block, onNavigate }: { block: UiBlock; onNavigate?: () => void }) {
  switch (block.type) {
    case "hotel_cards":
      return (
        <ul className="mt-2 space-y-2" role="list">
          {block.hotels.map((h) => (
            <li key={h.hotelId}>
              <Link href={h.href} onClick={onNavigate} className="flex gap-3 rounded-card border border-line bg-surface p-2 hover:border-primary">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-button bg-line">
                  <HotelImage src={h.imageUrl} alt="" sizes="64px" />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <Stars count={h.stars} />
                  <p className="truncate font-semibold">{h.name}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    {h.rating !== null ? <RatingBadge rating={h.rating} /> : <span />}
                    {h.price && <span className="font-semibold">{formatMoney(h.price)}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      );
    case "rate_cards":
      return (
        <ul className="mt-2 space-y-2" role="list">
          {block.rates.map((r, i) => (
            <li key={i} className="rounded-card border border-line bg-surface p-3 text-sm">
              <p className="font-semibold">{r.roomName}</p>
              <p className="text-xs text-muted">
                {r.board} · {cancellationText({ refundable: r.refundable, freeCancellationUntil: r.refundableUntil })}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-bold">{formatMoney(r.price)}</span>
                <Link href={r.href} onClick={onNavigate} className={buttonClasses({ size: "md" })}>
                  Обрати
                </Link>
              </div>
            </li>
          ))}
        </ul>
      );
    case "checkout_card":
      return (
        <div className="mt-2 rounded-card border border-primary/40 bg-primary-soft p-3 text-sm">
          <p className="font-semibold text-primary-dark">{block.hotelName}</p>
          <p className="text-primary-dark">
            {block.roomName} · {block.board}
          </p>
          <p className="mt-1 font-bold text-primary-dark">{formatMoney(block.price)}</p>
          <Link href={block.href} onClick={onNavigate} className={buttonClasses({ fullWidth: true, className: "mt-2" })}>
            Перейти до оформлення
          </Link>
          <p className="mt-1 text-xs text-primary-dark">Бронювання підтвердите на сторінці оформлення.</p>
        </div>
      );
    case "trip_cards":
      return (
        <ul className="mt-2 space-y-2" role="list">
          {block.trips.map((t) => (
            <li key={t.bookingId}>
              <Link href={t.href} onClick={onNavigate} className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 text-sm hover:border-primary">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{t.hotelName}</p>
                  <p className="text-xs text-muted">{formatDateRange(t.checkIn, t.checkOut)}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {t.status === "cancelled" ? "Скасовано" : t.status === "pending" ? "Обробляється" : t.checkedIn ? "Чекін ✓" : t.checkedIn === false ? "Без чекіну" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      );
    case "confirm_action":
      return <ConfirmCard block={block} />;
  }
}

type ConfirmState = "pending" | "busy" | "confirmed" | "cancelled" | "expired" | "failed";

const FAIL_COPY: Record<string, string> = {
  closed: "Для цього бронювання це вже недоступно.",
  invalid: "Дані запиту некоректні — попросіть асистента ще раз.",
  duplicate_open: "Такий запит уже чекає відповіді готелю.",
  limit: "Досягнуто ліміт запитів для бронювання.",
  session: "Увійдіть знову, щоб підтвердити.",
  rate_limited: "Забагато дій. Спробуйте трохи пізніше.",
  retry: "Не вдалося. Спробуйте ще раз.",
};

/** The only way a drafted action is executed: the guest's own click. */
function ConfirmCard({ block }: { block: Extract<UiBlock, { type: "confirm_action" }> }) {
  const router = useRouter();
  const [state, setState] = useState<ConfirmState>(() =>
    block.status && block.status !== "pending" ? block.status : Date.parse(block.expiresAt) < Date.now() ? "expired" : "pending",
  );
  const [message, setMessage] = useState<string | null>(null);

  const decide = async (decision: "confirm" | "cancel") => {
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`/api/assistant/actions/${block.actionId}/${decision}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = (await res.json()) as { status?: string; reason?: string };
      if (data.status === "confirmed") {
        setState("confirmed");
        router.refresh(); // the trip page shows the new check-in / request
      } else if (data.status === "cancelled" || data.status === "expired") setState(data.status);
      else {
        setState(data.status === "failed" ? "failed" : "pending");
        setMessage(FAIL_COPY[data.reason ?? "retry"] ?? FAIL_COPY.retry);
      }
    } catch {
      setState("pending");
      setMessage(FAIL_COPY.retry);
    }
  };

  const done = state === "confirmed" || state === "cancelled" || state === "expired" || state === "failed";
  return (
    <div className={cn("mt-2 rounded-card border p-3 text-sm", state === "confirmed" ? "border-success/40 bg-success/5" : "border-line bg-surface")}>
      <p className="flex items-center gap-1.5 font-semibold">
        <CalendarCheck className="size-4 text-primary" aria-hidden />
        {block.title}
      </p>
      {block.kind === "guest_request" && <p className="mt-1 text-xs text-muted">Текст підготував AI — перевірте перед підтвердженням.</p>}
      <ul className="mt-1 space-y-0.5 text-muted">
        {block.summary.map((s, i) => (
          <li key={i} className="break-words">
            {s}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-2 text-xs">
        {state === "confirmed" && (
          <span className="flex items-center gap-1 font-semibold text-success-ink">
            <Check className="size-3.5" aria-hidden /> Підтверджено
          </span>
        )}
        {state === "cancelled" && <span className="flex items-center gap-1 text-muted"><X className="size-3.5" aria-hidden /> Скасовано</span>}
        {state === "expired" && <span className="flex items-center gap-1 text-muted"><Clock className="size-3.5" aria-hidden /> Час підтвердження минув — попросіть асистента ще раз</span>}
        {message && <span className="text-danger">{message}</span>}
      </p>
      {!done && (
        <div className="mt-2 flex gap-2">
          <Button onClick={() => decide("confirm")} loading={state === "busy"} className="flex-1">
            Підтвердити
          </Button>
          <Button variant="ghost" onClick={() => decide("cancel")} disabled={state === "busy"}>
            Скасувати
          </Button>
        </div>
      )}
    </div>
  );
}
