'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';

export default function DesignersError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6">
      <Alert variant="destructive">
        <AlertTitle>Designers could not be loaded</AlertTitle>
        <AlertDescription>
          <p>Please try again. Your search and filters are saved in the address bar.</p>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
          >
            {pending ? 'Retrying…' : 'Try again'}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
