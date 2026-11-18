"use client";

import { cn } from "@/lib/cn";

type TabsProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<{ value: T; label: string }>;
  label: string;
  className?: string;
};

/** Segmented control. Arrow keys move between options. */
export function Tabs<T extends string>({ value, onChange, items, label, className }: TabsProps<T>) {
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    onChange(next.value);
    const buttons = (event.currentTarget.parentElement?.querySelectorAll("[role=tab]") ?? []) as NodeListOf<HTMLElement>;
    buttons[(index + step + items.length) % items.length]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col rounded-button bg-bg p-1 text-sm font-medium", className)}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "min-h-10 rounded-[10px] transition-colors",
              selected ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
