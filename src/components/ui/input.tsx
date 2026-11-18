"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, type = "text", className, id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={className}>
      <label htmlFor={inputId} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={inputId}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={cn(
            "min-h-12 w-full rounded-button border bg-surface px-3 text-base text-ink placeholder:text-muted",
            "focus:outline-2 focus:outline-primary",
            error ? "border-2 border-danger" : "border-line",
            isPassword && "pr-12",
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
            aria-label={revealed ? "Сховати пароль" : "Показати пароль"}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={messageId} className={cn("mt-1 text-xs", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
