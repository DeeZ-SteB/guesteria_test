"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { liteApiErrorMessage, type LiteApiErrorKind } from "@/lib/liteapi-messages";

export function HotelError({ kind, title = "Не вдалося завантажити готель" }: { kind: LiteApiErrorKind; title?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorState
      title={title}
      text={liteApiErrorMessage(kind)}
      action={
        <Button loading={pending} onClick={() => startTransition(() => router.refresh())}>
          Спробувати ще
        </Button>
      }
    />
  );
}
