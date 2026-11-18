import type { Metadata } from "next";
import { Suspense } from "react";
import { getHotel } from "@/server/liteapi";
import { HotelPage } from "@/features/hotel/hotel-page";
import { HotelSkeleton } from "@/features/hotel/hotel-skeleton";

export async function generateMetadata({ params }: PageProps<"/hotels/[hotelId]">): Promise<Metadata> {
  const { hotelId } = await params;
  try {
    return { title: (await getHotel(hotelId)).name };
  } catch {
    return { title: "Готель" };
  }
}

// Sync page: params/searchParams are awaited inside the boundary (runtime data under Cache Components).
export default function Page({ params, searchParams }: PageProps<"/hotels/[hotelId]">) {
  return (
    <Suspense fallback={<HotelSkeleton />}>
      <HotelPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}
