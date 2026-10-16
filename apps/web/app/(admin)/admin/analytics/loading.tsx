import { Skeleton } from '@repo/ui/components/skeleton';
export default function Loading() {
  return (
    <div className="space-y-5 p-6" aria-label="Loading company analytics">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
