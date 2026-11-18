import { Heart, Luggage, Search, User, type LucideIcon } from "lucide-react";

export type NavKey = "search" | "favorites" | "trips" | "profile";

export const NAV_ITEMS: ReadonlyArray<{ key: NavKey; href: string; label: string; icon: LucideIcon }> = [
  { key: "search", href: "/", label: "Пошук", icon: Search },
  { key: "favorites", href: "/account?tab=favorites", label: "Обране", icon: Heart },
  { key: "trips", href: "/account?tab=trips", label: "Поїздки", icon: Luggage },
  { key: "profile", href: "/account?tab=profile", label: "Кабінет", icon: User },
];

/** Which nav item is active for a path and its ?tab value. The account page defaults to trips. */
export function activeNavKey(pathname: string, tab: string | null): NavKey | null {
  if (pathname.startsWith("/account/trips")) return "trips";
  if (pathname === "/account") {
    if (tab === "favorites" || tab === "profile") return tab;
    return "trips";
  }
  if (pathname === "/" || pathname.startsWith("/hotels") || pathname.startsWith("/checkout")) {
    return "search";
  }
  return null;
}
