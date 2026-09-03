import { Card } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { cn } from '@repo/ui/lib/utils';
import { Container } from '@/components/container';

const TWO_ITEMS = [0, 1] as const;
const THREE_ITEMS = [0, 1, 2] as const;
const FIVE_ITEMS = [0, 1, 2, 3, 4] as const;

function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function PageHeadingLoading({ titleWidth = 'w-48' }: { titleWidth?: string }) {
  return (
    <div>
      <Skeleton className={`h-9 ${titleWidth} max-w-full`} />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
    </div>
  );
}

function ListControlsLoading({ tabCount }: { tabCount: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {Array.from({ length: tabCount }, (_, index) => (
          <Skeleton key={index} className="h-7 w-16 bg-background/70" />
        ))}
      </div>
      <Skeleton className="h-8 w-full sm:w-72" />
    </div>
  );
}

function TableLoading({ columns }: { columns: number }) {
  const gridColumns = columns === 6 ? 'grid-cols-6' : 'grid-cols-7';

  return (
    <div className="overflow-hidden rounded-lg">
      <div className={cn('grid gap-6 rounded-lg bg-muted/40 px-4 py-3', gridColumns)}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-4 w-20 max-w-full" />
        ))}
      </div>
      <div className="divide-y divide-border/40">
        {FIVE_ITEMS.map((row) => (
          <div key={row} className={cn('grid items-center gap-6 px-4 py-4', gridColumns)}>
            {Array.from({ length: columns }, (_, column) => (
              <div key={column} className="flex items-center gap-3">
                {column === 0 ? <Skeleton className="size-10 shrink-0" /> : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-full max-w-28" />
                  {column === 0 ? <Skeleton className="h-3 w-full max-w-20" /> : null}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DesignerListPageLoading({
  label,
  tabCount,
  columns,
}: {
  label: string;
  tabCount: number;
  columns: number;
}) {
  return (
    <LoadingRegion label={label} className="space-y-6 p-5">
      <ListControlsLoading tabCount={tabCount} />
      <TableLoading columns={columns} />
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-48" />
      </div>
    </LoadingRegion>
  );
}

export function DesignerDashboardLoading() {
  return (
    <LoadingRegion label="Loading dashboard" className="p-6 md:p-8 xl:p-10">
      <PageHeadingLoading titleWidth="w-80" />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_23.5rem]">
        <div className="min-w-0 space-y-5">
          <Card radius="2xl" className="p-6">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          </Card>

          <Card radius="2xl" className="p-6 shadow-md">
            <div className="space-y-6">
              {THREE_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-4">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-5 w-44 max-w-full" />
                    <Skeleton className="mt-2 h-4 w-full max-w-md" />
                  </div>
                  <Skeleton className="hidden h-9 w-28 sm:block" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card variant="accent" radius="2xl" className="p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-4 h-10 w-full" />
          </Card>
          <Card radius="2xl" className="space-y-4 p-4">
            {THREE_ITEMS.map((item) => (
              <div key={item} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </Card>
          <Card variant="accent" radius="3xl" className="p-5">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="mt-6 h-4 w-36" />
            <Skeleton className="mt-3 h-8 w-3/4" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-6 h-10 w-full" />
          </Card>
        </div>
      </div>
    </LoadingRegion>
  );
}

export function DesignerProjectsLoading() {
  return <DesignerListPageLoading label="Loading projects" tabCount={4} columns={6} />;
}

export function DesignerLeadsLoading() {
  return <DesignerListPageLoading label="Loading leads" tabCount={5} columns={7} />;
}

function FormCardLoading({ fields = 4 }: { fields?: number }) {
  return (
    <Card>
      <div className="border-b border-border px-6 py-5">
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DesignerProfileLoading() {
  return (
    <Container className="py-10">
      <LoadingRegion label="Loading profile settings">
        <div className="mb-8 max-w-2xl">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-9 w-64 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full" />
        </div>
        <div className="space-y-6">
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-full sm:w-64" />
          </Card>
          <FormCardLoading fields={4} />
          <FormCardLoading fields={6} />
          <FormCardLoading fields={4} />
        </div>
      </LoadingRegion>
    </Container>
  );
}

export function DesignerPortfolioLoading() {
  return (
    <LoadingRegion label="Loading portfolio settings" className="flex flex-col">
      <div className="px-6 py-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="-mt-2 flex flex-1">
        <div className="flex-1 p-6 lg:max-w-[65%]">
          <div className="space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
        <div className="hidden flex-col items-center p-6 lg:flex lg:w-[35%]">
          <Skeleton className="h-96 w-full rounded-3xl" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function DesignerTeamRolesLoading() {
  return (
    <LoadingRegion label="Loading team and roles" className="px-5 py-10 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {THREE_ITEMS.map((item) => (
            <Card key={item} className="space-y-3 p-4 shadow-xs">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>

        <Card className="p-5 shadow-xs">
          <Skeleton className="h-5 w-36" />
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(12rem,1fr)_auto]">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-28" />
          </div>
        </Card>

        {['Members', 'Invitations', 'Ownership and access'].map((section) => (
          <Card key={section} className="p-5 shadow-xs">
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 space-y-4">
              {THREE_ITEMS.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-52 max-w-full" />
                  </div>
                  <Skeleton className="h-8 w-28" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DesignerPlanBillingLoading() {
  return (
    <LoadingRegion label="Loading plan and billing" className="p-6 md:p-8 xl:p-10">
      <PageHeadingLoading titleWidth="w-64" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card radius="2xl" className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-9 w-44" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            {THREE_ITEMS.map((item) => (
              <Card key={item} radius="2xl" className="space-y-3 p-5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-2 w-full rounded-full" />
              </Card>
            ))}
          </div>
          {THREE_ITEMS.map((item) => (
            <Card key={item} radius="2xl" className="p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-20 w-full" />
            </Card>
          ))}
        </div>
        <aside className="space-y-4">
          {TWO_ITEMS.map((item) => (
            <Card key={item} radius="2xl" className="p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
              <Skeleton className="mt-4 h-9 w-full" />
            </Card>
          ))}
        </aside>
      </div>
    </LoadingRegion>
  );
}
