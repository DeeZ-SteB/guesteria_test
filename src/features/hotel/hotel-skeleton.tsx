import { Skeleton } from "@/components/ui/feedback";

export function HotelSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] md:px-8 md:py-6" aria-busy="true" aria-label="Завантаження готелю">
      <Skeleton className="h-64 rounded-none md:h-80 md:rounded-card" />
      <div className="space-y-3 px-4 py-4 md:px-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function RoomsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Завантажуємо номери">
      <p className="text-sm text-muted">Перевіряємо вільні номери й ціни…</p>
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-48 rounded-card" />
      ))}
    </div>
  );
}
