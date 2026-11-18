"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssistant } from "@/components/shell/assistant-fab";

export function AskAiButton({ hotelId, hotelName, compact = false }: { hotelId: string; hotelName: string; compact?: boolean }) {
  const { open } = useAssistant();
  return (
    <Button variant={compact ? "primary" : "outline"} fullWidth onClick={() => open({ page: "hotel", hotelId, hotelName })}>
      <Sparkles className="size-4" aria-hidden />
      {compact ? "Запитати AI" : "Запитати AI про цей готель"}
    </Button>
  );
}
