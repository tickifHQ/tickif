import { Skeleton } from '@repo/ui/components/skeleton';

export default function SavedProjectsLoading() {
  return (
    <main
      aria-label="Loading saved projects"
      aria-busy="true"
      className="mx-auto max-w-7xl px-6 py-10"
    >
      <Skeleton className="h-9 w-56" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-4/5 rounded-card" />
        ))}
      </div>
    </main>
  );
}
