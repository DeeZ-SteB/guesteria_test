"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { backToHotel } from "./back-to-hotel";

export type CheckoutPageError = "rate_gone" | "offer_stale" | "mismatch" | "invalid" | "retry" | "rate_limited";

const COPY: Record<CheckoutPageError, { title: string; text: string }> = {
  rate_gone: { title: "Цей тариф уже недоступний", text: "Хтось щойно забронював цей номер або тариф змінився. Оберіть інший." },
  offer_stale: { title: "Пропозиція застаріла", text: "Ціни оновились. Поверніться до готелю й оберіть номер знову." },
  mismatch: { title: "Посилання застаріло", text: "Дані бронювання не збігаються з обраними. Оберіть номер знову." },
  invalid: { title: "Неправильне посилання на бронювання", text: "Відкрийте готель і оберіть номер ще раз." },
  retry: { title: "Не вдалося перевірити тариф", text: "Сервіс бронювання відповідає надто довго або повернув помилку." },
  rate_limited: { title: "Забагато спроб", text: "Ви перевіряли тарифи надто часто. Спробуйте за кілька хвилин." },
};

/** A rate that is gone or stale: going back must drop the hotel's cached rates (see backToHotel). */
const DEAD_RATE: ReadonlySet<CheckoutPageError> = new Set(["rate_gone", "offer_stale", "mismatch"]);

export function CheckoutError({ kind, backHref, hotelId }: { kind: CheckoutPageError; backHref: string; hotelId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const copy = COPY[kind];
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center" role="alert">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-bold">{copy.title}</h1>
      <p className="mt-1 text-sm text-muted">{copy.text}</p>
      <div className="mt-6 flex flex-col gap-2">
        {kind === "retry" && (
          <Button size="lg" loading={pending} onClick={() => startTransition(() => router.refresh())}>
            Спробувати ще раз
          </Button>
        )}
        {hotelId && DEAD_RATE.has(kind) ? (
          <form action={backToHotel.bind(null, hotelId, backHref)}>
            <button type="submit" className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}>
              Повернутися до готелю
            </button>
          </form>
        ) : (
          <Link href={backHref} className={buttonClasses({ variant: kind === "retry" ? "ghost" : "primary", size: "lg" })}>
            Повернутися до готелю
          </Link>
        )}
      </div>
    </div>
  );
}
