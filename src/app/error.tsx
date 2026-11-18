"use client";

import { CloudAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={CloudAlert}
      title="Щось пішло не так"
      text="Не вдалося завантажити сторінку. Перевірте з'єднання й спробуйте ще раз."
      action={<Button onClick={reset}>Спробувати ще</Button>}
      className="py-24"
    />
  );
}
