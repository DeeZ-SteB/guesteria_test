import type { ReactNode } from "react";
import Link from "next/link";
import { Heart, LogOut, Luggage, User } from "lucide-react";
import type { ShellUser } from "@/server/auth";
import { signOut } from "@/features/auth/actions";
import { Avatar } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import type { AccountTab } from "./schemas";

const TABS: ReadonlyArray<{ value: AccountTab; label: string; icon: typeof Luggage }> = [
  { value: "trips", label: "Поїздки", icon: Luggage },
  { value: "favorites", label: "Обране", icon: Heart },
  { value: "profile", label: "Профіль", icon: User },
];

/** Phones: title + link tabs. From 1024 px: left menu with the user and sign-out, content on the right. */
export function AccountLayout({ user, tab, children }: { user: ShellUser; tab: AccountTab; children: ReactNode }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Гість";
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10 lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-8">
      <aside className="hidden rounded-card border border-line bg-surface p-4 lg:sticky lg:top-24 lg:block" aria-label="Меню кабінету">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <Avatar initials={user.initials} className="size-12 text-sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
        <nav className="mt-3 flex flex-col gap-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <Link
              key={value}
              href={`/account?tab=${value}`}
              aria-current={tab === value ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-button px-3 text-sm font-medium",
                tab === value ? "bg-primary-soft text-primary-dark" : "text-ink hover:bg-bg",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-3 border-t border-line pt-3">
          <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-button px-3 text-sm font-medium text-muted hover:bg-bg hover:text-ink">
            <LogOut className="size-4" aria-hidden />
            Вийти
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        <h1 className="text-headline font-bold lg:sr-only">Кабінет</h1>
        <nav aria-label="Розділи кабінету" className="mt-4 grid grid-cols-3 rounded-button bg-bg p-1 text-sm font-medium lg:hidden">
          {TABS.map(({ value, label }) => (
            <Link
              key={value}
              href={`/account?tab=${value}`}
              aria-current={tab === value ? "page" : undefined}
              className={cn(
                "grid min-h-10 place-items-center rounded-[10px] transition-colors",
                tab === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
