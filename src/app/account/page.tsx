import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Heart, LogOut, Luggage } from "lucide-react";
import { requireUser } from "@/server/auth";
import { signOut } from "@/features/auth/actions";
import { Avatar, EmptyState } from "@/components/ui/feedback";
import { Button, buttonClasses } from "@/components/ui/button";
import AccountLoading from "./loading";

export const metadata: Metadata = { title: "Кабінет" };

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountLoading />}>
      <AccountContent />
    </Suspense>
  );
}

// Stage 6 replaces the placeholders with trips, favorites and the profile form.
async function AccountContent() {
  const user = await requireUser("/account");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-headline font-bold">Кабінет</h1>

      <section className="mt-6 flex items-center gap-4 rounded-card border border-line bg-surface p-4">
        <Avatar initials={user.initials} className="size-12 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Гість"}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            <LogOut className="size-4" aria-hidden />
            Вийти
          </Button>
        </form>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={Luggage}
            title="Поки немає поїздок"
            text="Тут з'являться ваші бронювання, онлайн-чекін і запити до готелю."
            action={
              <Link href="/" className={buttonClasses()}>
                Знайти готель
              </Link>
            }
          />
        </section>
        <section className="rounded-card border border-line bg-surface">
          <EmptyState icon={Heart} title="В обраному порожньо" text="Натисніть ♡ на картці готелю, щоб зберегти його." />
        </section>
      </div>
    </div>
  );
}
