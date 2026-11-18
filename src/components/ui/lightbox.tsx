"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { lightboxWindow } from "@/lib/hotels/page";

export type LightboxImage = { src: string; alt: string };

/** Fullscreen photo viewer on native <dialog>: ←/→, Esc, swipe. Mounts only the current image ±1. */
export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const open = index !== null;
  const count = images.length;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const go = (step: number) => index !== null && onIndexChange((index + step + count) % count);

  return (
    <dialog
      ref={ref}
      aria-label="Фото готелю"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white"
    >
      {open && (
        <div
          className="relative flex h-full items-center justify-center"
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            setTouchX(null);
          }}
        >
          {lightboxWindow(index, count).map((i) => {
            const current = i === index;
            const image = images[i];
            // Neighbours are rendered invisibly (not display:none) and eager, so they really preload.
            return (
              <div key={i} className={current ? "relative h-full w-full" : "invisible absolute inset-0"} aria-hidden={!current}>
                <Image src={image.src} alt={current ? image.alt : ""} fill sizes="100vw" quality={75} className="object-contain" loading="eager" />
              </div>
            );
          })}
          <p className="absolute left-4 top-[calc(env(safe-area-inset-top)+16px)] rounded-full bg-black/60 px-3 py-1 text-sm" aria-live="polite">
            {index + 1} / {count}
          </p>
          <button type="button" onClick={onClose} aria-label="Закрити" className="absolute right-3 top-[calc(env(safe-area-inset-top)+8px)] grid size-11 place-items-center rounded-full bg-black/60">
            <X className="size-5" />
          </button>
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Попереднє фото" className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/60">
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Наступне фото" className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/60">
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
