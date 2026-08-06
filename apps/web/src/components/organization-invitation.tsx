'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Loader2, UsersRound } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { authClient } from '@/lib/auth-client';

export function OrganizationInvitation({ invitationId }: { invitationId: string }) {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, startTransition] = useTransition();

  function acceptInvitation() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await authClient.organization.acceptInvitation({ invitationId });
        if (result.error) {
          setError(result.error.message || 'Could not accept this invitation.');
          return;
        }
        window.location.href = '/designer/terms-roles';
      } catch {
        setError('Could not accept this invitation.');
      }
    });
  }

  const callbackPath = `/invitations/${encodeURIComponent(invitationId)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UsersRound className="size-5" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-foreground">Studio invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You have been invited to collaborate in a Tickif designer workspace.
        </p>

        {error ? (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-6">
          {isSessionPending ? (
            <Button className="w-full" disabled>
              <Loader2 className="size-4 animate-spin" />
              Checking your account
            </Button>
          ) : session ? (
            <Button className="w-full" disabled={isAccepting} onClick={acceptInvitation}>
              {isAccepting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Accept invitation
            </Button>
          ) : (
            <Button className="w-full" asChild>
              <Link href={`/login?mode=designer&callbackURL=${encodeURIComponent(callbackPath)}`}>
                Sign in to continue
              </Link>
            </Button>
          )}
        </div>
      </Card>
    </main>
  );
}
