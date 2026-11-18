import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight text-ink" aria-label="Guesteria Stay — на головну">
      Guesteria<span className="text-primary">Stay</span>
    </Link>
  );
}
