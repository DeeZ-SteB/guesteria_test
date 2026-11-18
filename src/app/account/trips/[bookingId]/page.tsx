import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Luggage } from "lucide-react";
import { requireUser } from "@/server/auth";
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

// Stage 7 adds the ownership check against `bookings` and the trip details.
async function TripContent({ params }: { params: PageProps<"/account/trips/[bookingId]">["params"] }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  await requireUser(`/account/trips/${parsed.data.bookingId}`);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
      <EmptyState icon={Luggage} title="Сторінка поїздки в розробці" text="Тут будуть онлайн-чекін, запити до готелю й AI-асистент." />
    </div>
  );
}
