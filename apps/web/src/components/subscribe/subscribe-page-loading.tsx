import { Card, CardContent, CardFooter, CardHeader } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { getCumulativeFeatures, PLAN_FEATURE_GROUPS, PLANS } from '@/lib/plan-config';

/** Shared by the route boundary and the initial subscription read to keep pricing in place. */
export function SubscribePageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading plans"
      aria-busy="true"
      className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12"
    >
      <span className="sr-only">Loading plans and feature comparison…</span>
      <div aria-hidden="true">
        <Skeleton className="mb-6 h-5 w-28" />
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-5 w-80 max-w-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-4 md:gap-0 md:border-y md:border-border">
            <div className="hidden md:row-span-2 md:block" />
            {PLANS.map((plan) => (
              <Card
                key={plan.tier}
                radius="lg"
                className="flex min-w-0 flex-col shadow-none md:row-span-2 md:grid md:grid-rows-subgrid md:rounded-none md:border-transparent"
              >
                <CardHeader className="gap-3 p-5">
                  <Skeleton className="h-7 w-32 max-w-full" />
                  <Skeleton className="h-8 w-36 max-w-full" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent className="flex-1 px-5 pb-5 md:hidden">
                  <div className="flex flex-col gap-2">
                    {getCumulativeFeatures(plan.tier).map((feature) => (
                      <Skeleton key={feature} className="h-4 w-3/4" />
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="px-5 pb-5">
                  <Skeleton className="h-11 w-full rounded-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
          <div className="hidden md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/4 px-0">
                    <Skeleton className="h-5 w-24" />
                  </TableHead>
                  {PLANS.map((plan) => (
                    <TableHead key={plan.tier} className="w-1/4 px-5">
                      <Skeleton className="h-5 w-28 max-w-full" />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              {PLAN_FEATURE_GROUPS.map((group) => (
                <TableBody key={group.label}>
                  <TableRow>
                    <TableHead colSpan={4} className="px-0 pt-7 pb-3">
                      <Skeleton className="h-5 w-36" />
                    </TableHead>
                  </TableRow>
                  {group.features.map((feature) => (
                    <TableRow key={feature.label}>
                      <TableHead className="px-0 py-3 pr-5">
                        <Skeleton className="h-5 w-3/4" />
                      </TableHead>
                      {PLANS.map((plan) => (
                        <TableCell key={plan.tier} className="px-5 py-3">
                          <Skeleton className="h-5 w-12" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              ))}
            </Table>
          </div>
          <div className="flex flex-col gap-6 md:hidden">
            {PLAN_FEATURE_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-4 border-b border-border pb-6">
                <Skeleton className="h-6 w-36" />
                {group.features.map((feature) => (
                  <div key={feature.label} className="flex flex-col gap-2">
                    <Skeleton className="h-5 w-40" />
                    {PLANS.map((plan) => (
                      <div key={plan.tier} className="flex justify-between gap-4">
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-5 w-12" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
