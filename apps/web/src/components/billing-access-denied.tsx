import { Lock } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import Link from 'next/link';

/**
 * Access-denied state for the Plan & Billing page.
 * Shown when the current user's org role does not have billing access.
 */
export function BillingAccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-32 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Lock className="size-7 text-muted-foreground" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">Billing access restricted</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Only the organization Owner can view Plan & Billing. Contact your organization owner for
        billing questions.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/designer">Back to dashboard</Link>
      </Button>
    </div>
  );
}
