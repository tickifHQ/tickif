import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { AlertTriangle, Lock, XCircle } from 'lucide-react';
import type { BillingLifecycleState } from '@/lib/billing-types';

interface BillingStatusBannerProps {
  lifecycle: BillingLifecycleState;
  graceDaysRemaining?: number | null;
  /** When true, renders a compact inline variant for the dashboard shell. */
  compact?: boolean;
}

/**
 * Reusable billing status banner — renders in the Plan & Billing page
 * and in the Designer Dashboard shell for grace/locked states.
 */
export function BillingStatusBanner({
  lifecycle,
  graceDaysRemaining,
  compact = false,
}: BillingStatusBannerProps) {
  if (lifecycle === 'active' || lifecycle === 'downgraded') return null;

  if (lifecycle === 'payment_failed') {
    return (
      <Alert variant="destructive">
        <XCircle />
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>
          <p>
            Your last payment could not be processed. Update your payment method to avoid service
            interruption.
          </p>
          {!compact && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/designer/plan-billing">Update payment method</Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (lifecycle === 'grace') {
    const days = graceDaysRemaining ?? 7;
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Payment due soon</AlertTitle>
        <AlertDescription>
          <p>
            Your payment is overdue. You have {days} day{days !== 1 ? 's' : ''} remaining before
            your account is locked. Full access continues during this period.
          </p>
          {!compact && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/designer/plan-billing">Make payment</Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (lifecycle === 'locked') {
    return (
      <Alert variant="destructive">
        <Lock />
        <AlertTitle>Locked – reactivate to restore full access</AlertTitle>
        <AlertDescription>
          <p>
            Your subscription has been suspended due to non-payment. Reactivate to restore access
            to all workspace features.
          </p>
          {!compact && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/designer/plan-billing">Reactivate subscription</Link>
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
