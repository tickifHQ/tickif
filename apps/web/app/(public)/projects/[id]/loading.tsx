import { Skeleton } from '@repo/ui/components/skeleton';

const SPECIFICATION_SKELETONS = ['property', 'bhk', 'location', 'budget'] as const;

export default function ProjectDetailLoading() {
  return (
    <article aria-busy="true" aria-label="Loading project" className="pb-24">
      <span className="sr-only">Loading project details</span>
      <div className="mx-auto w-full max-w-[1512px] px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center" aria-hidden>
          <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
        </div>

        <Skeleton
          aria-hidden
          className="aspect-[4/3] min-h-72 w-full rounded-xl motion-reduce:animate-none sm:aspect-[16/9] lg:aspect-[16/7]"
        />

        <div className="grid gap-10 py-12 lg:grid-cols-[minmax(0,2.2fr)_minmax(20rem,1fr)] lg:gap-16">
          <div className="min-w-0" aria-hidden>
            <Skeleton className="h-10 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="mt-3 h-5 w-48 motion-reduce:animate-none" />

            <div className="mt-6 grid gap-px overflow-hidden rounded-xl bg-border p-px sm:grid-cols-2 lg:grid-cols-4">
              {SPECIFICATION_SKELETONS.map((key) => (
                <div key={key} className="bg-muted px-4 py-3">
                  <Skeleton className="h-3 w-16 bg-background motion-reduce:animate-none" />
                  <Skeleton className="mt-2 h-5 w-24 bg-background motion-reduce:animate-none" />
                </div>
              ))}
            </div>

            <Skeleton className="mt-10 h-4 w-32 motion-reduce:animate-none" />
            <Skeleton className="mt-4 h-4 w-full motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-4 w-5/6 motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-4 w-2/3 motion-reduce:animate-none" />
          </div>

          <aside aria-hidden>
            <Skeleton className="h-80 w-full rounded-2xl motion-reduce:animate-none" />
          </aside>
        </div>

        <div className="border-t pt-12" aria-hidden>
          <Skeleton className="h-12 w-full rounded-xl motion-reduce:animate-none" />
          <div className="mt-12 flex gap-4 overflow-hidden">
            <Skeleton className="h-106 w-72 shrink-0 rounded-sm motion-reduce:animate-none sm:w-88" />
            <Skeleton className="h-106 w-72 shrink-0 rounded-sm motion-reduce:animate-none sm:w-88" />
            <Skeleton className="h-106 w-72 shrink-0 rounded-sm motion-reduce:animate-none sm:w-88" />
          </div>
        </div>
      </div>
    </article>
  );
}
