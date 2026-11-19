import { Skeleton } from "@/components/ui/feedback";

export function TabSkeleton() {
  return (
    <div aria-busy="true" aria-label="Завантаження">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    </div>
  );
}

export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10" aria-busy="true" aria-label="Завантаження">
      <Skeleton className="h-9 w-40 lg:hidden" />
      <div className="mt-4 lg:mt-0 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <Skeleton className="hidden h-72 rounded-card lg:block" />
        <TabSkeleton />
      </div>
    </div>
  );
}
