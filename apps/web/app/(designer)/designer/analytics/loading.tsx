import { Card } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';

export default function DesignerAnalyticsLoading() {
  return (
    <div className="p-6 md:p-8 xl:p-10" aria-label="Loading analytics">
      <Skeleton className="h-6 w-24" />
      <div className="mt-5 flex items-start gap-4">
        <Skeleton className="size-12 shrink-0 rounded-2xl" />
        <div className="w-full max-w-2xl">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-3 h-5 w-full" />
        </div>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} radius="2xl">
            <div className="px-5 py-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-9 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          </Card>
        ))}
      </div>
      <Card radius="2xl" className="mt-8">
        <div className="px-6 py-6">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          <Skeleton className="mt-6 h-64 w-full rounded-xl" />
        </div>
      </Card>
    </div>
  );
}
