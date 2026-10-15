'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@repo/ui/components/card';
import { cn } from '@repo/ui/lib/utils';

type DesignerDashboardLoadErrorProps = {
  canWriteProjects: boolean;
  canEditOrganization: boolean;
};

export function DesignerDashboardLoadError({
  canWriteProjects,
  canEditOrganization,
}: DesignerDashboardLoadErrorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Card radius="2xl" className="mt-5" role="alert" aria-busy={isPending}>
      <CardHeader>
        <CardTitle>
          <h2>Could not load dashboard summary</h2>
        </CardTitle>
        <CardDescription>
          Your projects and portfolio have not changed. Retry to load your dashboard, or continue
          managing your work below.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          aria-label={isPending ? 'Retrying dashboard summary' : undefined}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCw
            data-icon="inline-start"
            className={cn(isPending && 'animate-spin motion-reduce:animate-none')}
            aria-hidden="true"
          />
          Retry
        </Button>
        <Button asChild variant="outline">
          <Link href="/designer/projects">View projects</Link>
        </Button>
        {canWriteProjects ? (
          <Button asChild>
            <Link href="/designer/projects/new">Add project</Link>
          </Button>
        ) : null}
        {canEditOrganization ? (
          <Button asChild variant="outline">
            <Link href="/designer/portfolio">Manage portfolio</Link>
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
