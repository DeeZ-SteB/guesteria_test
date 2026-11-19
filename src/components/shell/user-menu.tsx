import Link from "next/link";
import { ChevronDown, LogOut, User } from "lucide-react";
import { Avatar, Skeleton } from "@/components/ui/feedback";
import { getCurrentUser } from "@/server/auth";
import { signOut } from "@/features/auth/actions";
import { SignInButton } from "./sign-in-button";
import { Dropdown } from "./dropdown";

/** Header account control. Reads the session, so it must render inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return <SignInButton />;

  const name = user.firstName || user.email;
  return (
    <Dropdown
      label={`Меню акаунта: ${name}`}
      trigger={
        <>
          <Avatar initials={user.initials} decorative={false} />
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </>
      }
    >
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <Link href="/account?tab=profile" className="flex items-center gap-2 rounded-button px-3 py-2.5 text-sm hover:bg-bg">
        <User className="size-4" aria-hidden />
        Кабінет
      </Link>
      <form action={signOut}>
        <button type="submit" className="flex w-full items-center gap-2 rounded-button px-3 py-2.5 text-left text-sm text-danger hover:bg-bg">
          <LogOut className="size-4" aria-hidden />
          Вийти
        </button>
      </form>
    </Dropdown>
  );
}

export function UserMenuFallback() {
  return <Skeleton className="size-9 rounded-full" />;
}
