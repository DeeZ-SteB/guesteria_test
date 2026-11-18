"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { activeNavKey, NAV_ITEMS } from "./nav-items";

/** Desktop navigation links (profile lives in the user menu). Render inside <Suspense>. */
export function HeaderNav() {
  const active = activeNavKey(usePathname(), useSearchParams().get("tab"));
  return (
    <nav aria-label="Основна навігація">
      <ul className="flex items-center gap-1 text-sm font-medium">
        {NAV_ITEMS.filter((item) => item.key !== "profile").map(({ key, href, label }) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={key === active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-button px-3",
                key === active ? "text-primary" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
