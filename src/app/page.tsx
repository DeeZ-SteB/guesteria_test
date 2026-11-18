import { Suspense } from "react";
import { SearchArea, SearchPageSkeleton } from "@/features/search/search-area";

// Sync page: searchParams are awaited inside the boundary so the shell stays static.
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchArea searchParams={searchParams} />
    </Suspense>
  );
}
