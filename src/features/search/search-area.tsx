import { Suspense } from "react";
import { connection } from "next/server";
import { defaultStay, todayInKyiv } from "@/lib/booking/stay";
import { parseSearchParams, searchKey, type FormValues } from "@/lib/search/params";
import { Skeleton } from "@/components/ui/feedback";
import { SearchForm } from "./search-form";
import { AiBanner, PopularCities, RecentSearches } from "./start-extras";
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
      <section className="bg-primary text-on-primary">
        <div className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 md:px-8 md:pb-24 md:pt-14">
          <h1 className="text-headline font-bold md:text-display">Куди їдемо?</h1>
          <p className="mt-2 opacity-90">Готелі з AI-консьєржем для вашої поїздки</p>
        </div>
      </section>
      <div className="mx-auto -mt-14 max-w-[1200px] px-4 md:-mt-16 md:px-8">
        <div className="rounded-card bg-surface p-3 shadow-lg">
          <SearchForm key={JSON.stringify({ initial, errors })} initial={initial} errors={errors} today={today} layout="inline" />
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-8">
        <AiBanner />
        <Suspense fallback={null}>
          <RecentSearches today={today} />
        </Suspense>
        <PopularCities today={today} />
      </div>
    </>
  );
}

export function SearchPageSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-44 bg-primary md:h-56" />
      <div className="mx-auto -mt-14 max-w-[1200px] px-4 md:px-8">
        <Skeleton className="h-64 rounded-card lg:h-20" />
      </div>
    </div>
  );
}
