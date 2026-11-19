import Link from "next/link";

export function Logo() {
  return (
    // The accessible name contains the visible text ("Guesteria Stay") plus where the link goes.
    <Link href="/" className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight text-ink">
      Guesteria<span className="sr-only"> </span>
      <span className="text-primary">Stay</span>
      <span className="sr-only"> — на головну</span>
    </Link>
  );
}
