'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { authClient } from '@/lib/auth-client';

export function DesignerMembershipExit({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function leaveOrganization() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.leave({ organizationId });
        if (result.error) {
          setError(result.error.message || 'Could not leave the organisation.');
          return;
        }
        router.replace('/designer/select-studio');
      } catch {
        setError('Could not leave the organisation.');
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Card radius="2xl" className="w-full max-w-lg space-y-5 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Studio access unavailable
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Your membership is inactive or no longer grants workspace access. You can still leave
            the organisation to remove it from your account.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {confirming ? (
          <div className="space-y-3 rounded-xl border border-border bg-background p-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Leaving removes this studio membership from your account immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={leaveOrganization}
              >
                {isPending ? <Loader2 className="animate-spin" /> : null}
                Confirm leave
              </Button>
              <Button
                type="button"
                variant="neutral"
                disabled={isPending}
                onClick={() => setConfirming(false)}
              >
                Keep membership
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            Leave organisation
          </Button>
        )}
      </Card>
    </main>
  );
}
