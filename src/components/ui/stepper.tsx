"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label: string;
  /** Text shown and announced, e.g. "2 дорослих". */
  valueText: string;
  name?: string;
};

export function Stepper({ value, onChange, min, max, label, valueText, name }: StepperProps) {
  const button = "grid size-11 place-items-center rounded-full border transition-colors disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        className={cn(button, "border-line")}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Менше: ${label}`}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-6 text-center font-semibold" aria-label={valueText}>
        {value}
      </output>
      <button
        type="button"
        className={cn(button, "border-primary text-primary")}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Більше: ${label}`}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
