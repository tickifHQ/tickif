import { Skeleton } from '@repo/ui/components/skeleton';
export function ConsultationsLoading() {
  return (
    <div
      role="status"
      aria-label="Loading consultations"
      className="mx-auto flex max-w-4xl flex-col gap-5 p-8"
    >
      <Skeleton className="h-8 w-52" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
