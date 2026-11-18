import { Skeleton } from "@/components/ui/feedback";

export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10" aria-busy="true" aria-label="Завантаження">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-6 h-20 w-full rounded-card" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  );
}
