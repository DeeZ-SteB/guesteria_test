"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        pressed ? "border-2 border-primary bg-primary-soft text-primary-dark" : "border-line bg-surface hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}
