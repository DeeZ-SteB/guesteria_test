"use client";

import { useState } from "react";
import Image from "next/image";
import { Hotel } from "lucide-react";
import { cn } from "@/lib/cn";
import { isAllowedImageUrl } from "@/lib/hotels/images";

type HotelImageProps = {
  src: string | null;
  alt: string;
  sizes: string;
  /** Only for the likely LCP image (first card). `priority` is deprecated in Next 16. */
  eager?: boolean;
  className?: string;
};

/** Fills its (relatively positioned) parent. Falls back to a neutral tile on missing/broken/foreign URLs. */
export function HotelImage({ src, alt, sizes, eager = false, className }: HotelImageProps) {
  const [failed, setFailed] = useState(false);
  if (!isAllowedImageUrl(src) || failed) {
    return (
      <div className={cn("absolute inset-0 grid place-items-center bg-gradient-to-br from-primary-soft to-line text-primary", className)} aria-hidden>
        <Hotel className="size-10 opacity-60" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      quality={75}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}
