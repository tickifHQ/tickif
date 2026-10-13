'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';

/** Refresh the current visitor URL without clearing their search or preferences. */
export function VisitorHomeLoadError({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCw aria-hidden data-icon="inline-start" />
          {pending ? 'Retrying…' : 'Retry'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
