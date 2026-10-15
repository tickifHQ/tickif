import { Skeleton } from '@repo/ui/components/skeleton';

export default function VisitorHomeLoading() {
  return (
    <main
      className="flex min-h-screen flex-col gap-6 bg-visitor-home-background px-5 py-8 sm:px-8 lg:px-12"
      aria-busy="true"
      aria-label="Loading your home feed"
    >
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-6 w-80 max-w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-60 w-full sm:h-72" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </main>
  );
}
