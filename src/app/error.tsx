"use client";

import { CloudAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

// `retry` re-fetches the segment; `reset` would only re-render stale data (Next.js 16.3+).
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      icon={CloudAlert}
      title="Щось пішло не так"
      text="Не вдалося завантажити сторінку. Перевірте з'єднання й спробуйте ще раз."
      action={<Button onClick={() => retry()}>Спробувати ще</Button>}
      className="py-24"
    />
  );
}
