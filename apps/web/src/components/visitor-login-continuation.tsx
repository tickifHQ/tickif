'use client';

import { useEffect, useState } from 'react';
import { ACCOUNT_STATUS, PLATFORM_ROLE } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { VisitorOnboardingForm } from '@/components/visitor-onboarding-form';
import { authClient } from '@/lib/auth-client';
import { VISITOR_AUTH_CONTINUE_PATH } from '@/lib/auth-paths';

export function VisitorLoginContinuation({
  callbackPath,
  onSuccess,
}: {
  callbackPath?: string;
  onSuccess?: () => void;
}) {
  const [state, setState] = useState<'loading' | 'welcome' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function continueSignIn() {
      const { data, error } = await authClient.getSession({ query: { disableCookieCache: true } });
      if (cancelled) return;
      if (error || !data) throw new Error('Session unavailable');
      if (
        'role' in data.user &&
        data.user.role === PLATFORM_ROLE.VISITOR &&
        'status' in data.user &&
        data.user.status === ACCOUNT_STATUS.PENDING &&
        !data.session.activeOrganizationId
      ) {
        setState('welcome');
      } else if (onSuccess) {
        onSuccess();
      } else {
        window.location.assign(callbackPath ?? VISITOR_AUTH_CONTINUE_PATH);
      }
    }
    void continueSignIn().catch(() => {
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, callbackPath, onSuccess]);

  if (state === 'welcome') return <VisitorOnboardingForm callbackPath={callbackPath} />;
  return (
    <Card className="mx-auto w-full max-w-[836px] p-8 text-center">
      {state === 'error' ? (
        <>
          <p role="alert">Could not confirm your sign-in. Please try again.</p>
          <Button
            className="mt-4"
            onClick={() => {
              setState('loading');
              setAttempt(attempt + 1);
            }}
          >
            Retry
          </Button>
        </>
      ) : (
        <div role="status">
          <p>Signed in</p>
          <p className="mt-1 text-sm text-muted-foreground">Opening your space…</p>
        </div>
      )}
    </Card>
  );
}
