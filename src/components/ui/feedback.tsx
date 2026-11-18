import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-button bg-line", className)} aria-hidden />;
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-dark",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

type StateProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, text, action, className }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
