'use client';

import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { RefreshCw } from 'lucide-react';

export function AdminSummaryLoadError({ message }: { message: string }) {
  const router = useRouter();

  return (
    <Alert variant="destructive">
      <AlertTitle>Platform summary unavailable</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
