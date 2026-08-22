import { Card } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';

export default function DesignerAnalyticsLoading() {
  return (
    <div className="p-6" aria-label="Loading analytics">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="size-8 shrink-0" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} radius="lg" className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-36 max-w-full" />
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} radius="lg" className="min-h-80 px-4 py-5">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="mt-2 h-4 w-32" />
            <Skeleton className="mt-5 h-44 w-full" />
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.82fr)]">
        <Card radius="lg" className="min-h-72 px-4 py-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-6 w-3/4" />
          <Skeleton className="mt-8 h-28 w-full" />
        </Card>
        <Card radius="lg" className="min-h-72 px-4 py-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mx-auto mt-5 size-44 rounded-full" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} radius="lg" className="min-h-48 px-4 py-5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-5 h-28 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
