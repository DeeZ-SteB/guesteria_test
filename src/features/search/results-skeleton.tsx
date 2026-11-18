import { Skeleton } from "@/components/ui/feedback";

export function ResultsSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-4 md:px-8">
      <p role="status" className="mb-3 text-sm text-muted">
        Шукаємо найкращі ціни — це займе кілька секунд…
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[260px_1fr]">
        <Skeleton className="hidden h-96 rounded-card lg:block" />
        <div className="grid gap-3 md:col-span-2 md:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-card border border-line bg-surface lg:flex">
              <Skeleton className="h-40 rounded-none lg:h-44 lg:w-60" />
              <div className="flex-1 space-y-2 p-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="ml-auto h-6 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
