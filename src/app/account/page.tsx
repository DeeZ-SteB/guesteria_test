import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { accountTabSchema } from "@/features/account/schemas";
import { AccountLayout } from "@/features/account/account-layout";
import { TripsSection } from "@/features/account/trips/trips-section";
import { FavoritesSection } from "@/features/account/favorites/favorites-section";
import { ProfileSection } from "@/features/account/profile/profile-section";
import AccountLoading, { TabSkeleton } from "./loading";

export const metadata: Metadata = { title: "Кабінет" };
// Cancellation: LiteAPI cancel (30 s) + read-back (15 s) + DB.
export const maxDuration = 60;

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <Suspense fallback={<AccountLoading />}>
      <AccountContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountContent({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const raw = await searchParams;
  const tab = accountTabSchema.parse(typeof raw.tab === "string" ? raw.tab : undefined);
  const user = await requireUser(`/account?tab=${tab}`);

  return (
    <AccountLayout user={user} tab={tab}>
      {/* Only the active tab is rendered (and fetched). */}
      <Suspense key={tab} fallback={<TabSkeleton />}>
        {tab === "trips" && <TripsSection userId={user.id} />}
        {tab === "favorites" && <FavoritesSection />}
        {tab === "profile" && <ProfileSection />}
      </Suspense>
    </AccountLayout>
  );
}
