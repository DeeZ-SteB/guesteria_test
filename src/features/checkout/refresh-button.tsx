"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="lg" loading={pending} onClick={() => startTransition(() => router.refresh())}>
      Оновити статус
    </Button>
  );
}
