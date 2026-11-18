import { Suspense } from "react";
import { Logo } from "./logo";
import { HeaderNav } from "./header-nav";
import { UserMenu, UserMenuFallback } from "./user-menu";

/** Top bar. Phones see only the logo; navigation moves to the bottom tab bar there. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 md:h-16 md:px-8">
        <Logo />
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Suspense fallback={null}>
            <HeaderNav />
          </Suspense>
          <Suspense fallback={<UserMenuFallback />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
