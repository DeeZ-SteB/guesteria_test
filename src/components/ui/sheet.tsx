"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Bottom sheet on phones, centered modal from 768 px.
 * Built on native <dialog>.showModal(): focus trap, Esc and inert background come for free.
 */
export function Sheet({ open, onClose, title, description, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      aria-labelledby={titleId}
      className={cn(
        "m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto bg-surface p-0 text-ink",
        "mt-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
        "md:m-auto md:max-w-[440px] md:rounded-card md:pb-0 md:shadow-2xl",
        className,
      )}
    >
      <div className="p-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-title font-bold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg"
            aria-label="Закрити"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4">{open && children}</div>
      </div>
    </dialog>
  );
}
