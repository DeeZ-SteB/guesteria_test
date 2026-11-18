"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Images } from "lucide-react";
import type { HotelImage } from "@/lib/hotels/types";
import { imageAlt } from "@/lib/hotels/page";
import { HotelImage as Photo } from "@/components/ui/hotel-image";
import { Lightbox } from "@/components/ui/lightbox";

const MOBILE_SLIDES = 10;

/** Phones: scroll-snap carousel (10 slides + «Усі N фото»). Desktop: 1 + 4 grid. Both open the lightbox. */
export function Gallery({ images, hotelName, backHref }: { images: HotelImage[]; hotelName: string; backHref: string }) {
  const [viewer, setViewer] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const total = images.length;
  const lightbox = images.map((img, i) => ({ src: img.hdUrl ?? img.url, alt: imageAlt(hotelName, img.caption, i, total) }));

  if (total === 0) {
    return (
      <div className="relative h-56 bg-line md:rounded-card">
        <Photo src={null} alt="" sizes="100vw" />
      </div>
    );
  }

  return (
    <>
      {/* Mobile carousel */}
      <div className="relative md:hidden">
        <ul
          className="flex h-64 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`Фото: ${hotelName}`}
          onScroll={(e) => {
            const el = e.currentTarget;
            setCurrent(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {images.slice(0, MOBILE_SLIDES).map((img, i) => (
            <li key={img.url} className="relative h-full w-full shrink-0 snap-center">
              <button type="button" className="absolute inset-0" onClick={() => setViewer(i)} aria-label={`Відкрити фото ${i + 1} з ${total}`}>
                <Image
                  src={img.url}
                  alt={imageAlt(hotelName, img.caption, i, total)}
                  fill
                  sizes="100vw"
                  quality={75}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  className="object-cover"
                />
              </button>
            </li>
          ))}
          {total > MOBILE_SLIDES && (
            <li className="relative grid h-full w-full shrink-0 snap-center place-items-center bg-ink text-white">
              <button type="button" onClick={() => setViewer(MOBILE_SLIDES)} className="flex min-h-11 flex-col items-center gap-2 font-semibold">
                <Images className="size-8" aria-hidden />
                Усі {total} фото
              </button>
            </li>
          )}
        </ul>
        <Link href={backHref} aria-label="Назад до результатів" className="absolute left-3 top-3 grid size-11 place-items-center rounded-full bg-surface/95 shadow">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs text-white" aria-hidden>
          {Math.min(current + 1, total)} / {total}
        </span>
      </div>

      {/* Desktop grid 1 + 4 */}
      <div className="mt-2 hidden h-80 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-card md:grid lg:h-96">
        {images.slice(0, 5).map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setViewer(i)}
            className={`relative overflow-hidden bg-line ${i === 0 ? "col-span-2 row-span-2" : ""}`}
            aria-label={`Відкрити фото ${i + 1} з ${total}`}
          >
            <Image
              src={img.url}
              alt={imageAlt(hotelName, img.caption, i, total)}
              fill
              sizes={i === 0 ? "(min-width:1200px) 600px, 50vw" : "(min-width:1200px) 300px, 25vw"}
              quality={75}
              // Lazy so phones (grid hidden) never download it; on desktop it is in view and
              // loads at once, with high priority as the likely LCP image.
              loading="lazy"
              fetchPriority={i === 0 ? "high" : "auto"}
              className="object-cover transition-transform hover:scale-105"
            />
            {i === 4 && total > 5 && (
              <span className="absolute inset-0 grid place-items-center bg-ink/50 font-semibold text-white">+{total - 5} фото</span>
            )}
          </button>
        ))}
      </div>

      <Lightbox images={lightbox} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />
    </>
  );
}
