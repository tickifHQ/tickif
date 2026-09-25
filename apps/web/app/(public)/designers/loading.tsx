import { Skeleton } from '@repo/ui/components/skeleton';

export default function DesignersLoading() {
  return (
    <div
      role="status"
      aria-label="Loading designers"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 sm:px-6"
    >
      <span className="sr-only">Loading designers…</span>
      <Skeleton className="h-10 w-60" />
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}
