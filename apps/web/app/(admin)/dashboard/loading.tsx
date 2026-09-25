import { Card, CardContent, CardHeader } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';

export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </header>

      <section aria-label="Loading platform summary" className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-52" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }, (_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="size-10 rounded-lg" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
