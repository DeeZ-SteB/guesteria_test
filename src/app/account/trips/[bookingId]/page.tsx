import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Luggage } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getOwnBooking } from "@/server/bookings";
import { EmptyState } from "@/components/ui/feedback";
import AccountLoading from "../../loading";

export const metadata: Metadata = { title: "Моя поїздка" };

const paramsSchema = z.object({ bookingId: z.uuid() });

export default function TripPage({ params }: PageProps<"/account/trips/[bookingId]">) {
  return (
    <Suspense fallback={<AccountLoading />}>
      <TripContent params={params} />
    </Suspense>
  );
}

// Stage 7 adds the trip details, check-in and requests.
async function TripContent({ params }: { params: PageProps<"/account/trips/[bookingId]">["params"] }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const user = await requireUser(`/account/trips/${parsed.data.bookingId}`);
  // Someone else's id and a missing one look the same: 404.
  const booking = await getOwnBooking(user.id, parsed.data.bookingId);
  if (!booking) notFound();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <EmptyState icon={Luggage} title="Сторінка поїздки в розробці" text="Тут будуть онлайн-чекін, запити до готелю й AI-асистент." />
    </div>
  );
}
