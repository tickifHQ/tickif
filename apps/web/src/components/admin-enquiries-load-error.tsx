'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@repo/ui/components/button';

export function AdminEnquiriesLoadError({ message }: { message: string }) {
  const router = useRouter();

  return (
    <div
      role="alert"
      className="flex flex-col items-start justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Enquiries could not be loaded</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
        Try again
      </Button>
    </div>
  );
}
