"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { liteApiErrorMessage, type LiteApiErrorKind } from "@/lib/liteapi-messages";

export function SearchError({ kind }: { kind: LiteApiErrorKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const dateProblem = kind === "invalid_request";
  return (
    <ErrorState
      title={dateProblem ? "Перевірте параметри пошуку" : "Не вдалося отримати ціни"}
      text={dateProblem ? "Схоже, дати або місто вказані неправильно. Змініть їх у формі вище." : liteApiErrorMessage(kind)}
      action={
        !dateProblem && (
          <Button loading={pending} onClick={() => startTransition(() => router.refresh())}>
            Спробувати ще
          </Button>
        )
      }
    />
  );
}
