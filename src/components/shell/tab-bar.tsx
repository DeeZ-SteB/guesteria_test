"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { activeNavKey, NAV_ITEMS } from "./nav-items";

/** Bottom navigation for phones (< 768 px). Render inside <Suspense> (reads search params). */
export function TabBar() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const active = activeNavKey(pathname, tab);

  return (
    <nav
      aria-label="Основна навігація"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-(--gs-tabbar-height) grid-cols-4">
        {NAV_ITEMS.map(({ key, href, label, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px]",
                  current ? "font-semibold text-primary" : "text-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Placeholder with the same height so the layout does not jump while params load. */
export function TabBarFallback() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 h-(--gs-tabbar-height) border-t border-line bg-surface md:hidden"
      aria-hidden
    />
  );
}
