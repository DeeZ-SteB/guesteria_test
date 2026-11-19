import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";

export function Logo() {
  return (
    // The accessible name contains the visible text ("Guesteria Stay") plus where the link goes.
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-lg font-bold tracking-tight text-ink">
      <LogoMark className="size-8 shrink-0" />
      <span>
        Guesteria<span className="sr-only"> </span>
        <span className="text-primary">Stay</span>
      </span>
      <span className="sr-only"> — на головну</span>
    </Link>
  );
}
