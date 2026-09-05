import { Skeleton } from '@repo/ui/components/skeleton';

export default function Loading() {
  return (
    <main
      role="status"
      aria-label="Loading personal settings"
      className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-80 w-full" />
    </main>
  );
}
