'use client';

import { useRouter } from 'next/navigation';
import { Alert, AlertTitle, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';

export function BillingLoadError() {
  const router = useRouter();
  return (
    <div className="p-8">
      <Alert variant="destructive">
        <AlertTitle>Billing information unavailable</AlertTitle>
        <AlertDescription>
          <p>We could not load your subscription. Please retry before making billing changes.</p>
          <Button variant="outline" onClick={() => router.refresh()}>
            Retry billing
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
