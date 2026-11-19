import { Suspense } from "react";
import { connection } from "next/server";
import { defaultStay, todayInKyiv } from "@/lib/booking/stay";
import { parseSearchParams, searchKey, type FormValues } from "@/lib/search/params";
import { Skeleton } from "@/components/ui/feedback";
import { SearchForm } from "./search-form";
import { Sparkles } from "lucide-react";
import { AiBanner, RecentSearches } from "./start-extras";
import { GuestReviews, HeroPhoto, PopularCities, SectionSkeleton, TopHotels, WhyGuesteria } from "@/features/home/sections";
import { SearchHeader } from "./search-header";
import { Results } from "./results";
import { ResultsSkeleton } from "./results-skeleton";

export async function SearchArea({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // "Today" depends on the request time, which Next 16 forbids during prerendering.
  // Awaiting searchParams is not enough when there are none, so opt in explicitly.
  const raw = await searchParams;
  await connection();
  const today = todayInKyiv();
  const parsed = parseSearchParams(raw, today);

  if (parsed.status !== "ok") {
    const stay = defaultStay(today);
    const initial: FormValues =
      parsed.status === "invalid"
        ? { ...parsed.values, adults: parsed.values.adults || "2" }
        : { city: "", checkIn: stay.checkIn, checkOut: stay.checkOut, adults: "2" };
    return <StartLayout initial={initial} errors={parsed.status === "invalid" ? parsed.errors : {}} today={today} />;
  }

  return (
    <>
      <SearchHeader query={parsed.query} today={today} />
      <Suspense key={searchKey(parsed.query)} fallback={<ResultsSkeleton />}>
        <Results query={parsed.query} />
      </Suspense>
    </>
  );
}

function StartLayout({ initial, errors, today }: { initial: FormValues; errors: Parameters<typeof SearchForm>[0]["errors"]; today: string }) {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-primary text-white">
        {/* A real hotel photo from the catalogue; the teal fallback shows until it loads. */}
        <Suspense fallback={null}>
          <HeroPhoto />
        </Suspense>
        <div className="absolute inset-0 -z-0 bg-gradient-to-b from-black/55 via-black/35 to-primary/90" aria-hidden />
        <div className="relative mx-auto max-w-[1200px] px-4 pb-24 pt-10 md:px-8 md:pb-32 md:pt-20">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="size-3.5" aria-hidden />
            Готелі з AI-консьєржем
          </p>
          <h1 className="mt-3 max-w-2xl text-headline font-bold leading-tight md:text-display">Знайдіть готель, у який захочеться повернутися</h1>
          <p className="mt-2 max-w-xl text-white/90">Живі ціни, чесні умови скасування, онлайн-чекін і консьєрж, який знає вашу поїздку.</p>
        </div>
      </section>
      <div className="relative mx-auto -mt-16 max-w-[1200px] px-4 md:-mt-20 md:px-8">
        <div className="rounded-card bg-surface p-3 shadow-xl">
          <SearchForm key={JSON.stringify({ initial, errors })} initial={initial} errors={errors} today={today} layout="inline" />
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-8 md:px-8">
        <div className="space-y-6">
          <AiBanner />
          <Suspense fallback={null}>
            <RecentSearches today={today} />
          </Suspense>
        </div>
        <Suspense fallback={<SectionSkeleton />}>
          <PopularCities today={today} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton tall />}>
          <TopHotels today={today} />
        </Suspense>
        <WhyGuesteria />
        <Suspense fallback={<SectionSkeleton />}>
          <GuestReviews today={today} />
        </Suspense>
      </div>
    </>
  );
}

export function SearchPageSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-56 bg-primary md:h-80" />
      <div className="mx-auto -mt-14 max-w-[1200px] px-4 md:px-8">
        <Skeleton className="h-64 rounded-card lg:h-20" />
      </div>
    </div>
  );
}
