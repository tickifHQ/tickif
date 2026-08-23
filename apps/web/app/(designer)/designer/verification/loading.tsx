import { Skeleton } from '@repo/ui/components/skeleton';

export default function DesignerVerificationLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl p-6" aria-label="Loading verification details">
      <Skeleton className="h-7 w-36" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-4 grid items-start gap-6 xl:grid-cols-[minmax(0,2.55fr)_minmax(17rem,1fr)]">
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
