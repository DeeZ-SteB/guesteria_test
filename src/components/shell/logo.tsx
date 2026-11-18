import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="text-lg font-bold tracking-tight text-ink" aria-label="Guesteria Stay — на головну">
      Guesteria<span className="text-primary">Stay</span>
    </Link>
  );
}
