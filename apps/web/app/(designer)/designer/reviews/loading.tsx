import { Skeleton } from '@repo/ui/components/skeleton';
export default function Loading() {
  return (
    <section role="status" aria-label="Loading reviews" className="flex flex-col gap-5 p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full" />
    </section>
  );
}
