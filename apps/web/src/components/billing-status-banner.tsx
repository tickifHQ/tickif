import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { AlertTriangle, Lock, XCircle } from 'lucide-react';
import type { BillingLifecycleState } from '@/lib/billing-types';

interface BillingStatusBannerProps {
  lifecycle: BillingLifecycleState;
  graceDaysRemaining?: number | null;
  lockedDaysRemaining?: number | null;
}

function daysRemainingCopy(days: number, unit: 'grace' | 'locked'): string {
  if (days <= 0) {
    return unit === 'grace' ? ' The grace period has expired.' : ' The locked window has expired.';
  }
  const dayWord = days === 1 ? 'day' : 'days';
  return unit === 'grace'
    ? ` You have ${days} ${dayWord} remaining before your account is locked.`
    : ` You have ${days} ${dayWord} to reactivate before your account is downgraded.`;
}

/**
 * Billing status banner for the Plan & Billing detail page.
 * Persistent dashboard-shell placement is a follow-up once E-239 provides a real read.
 */
export function BillingStatusBanner({
  lifecycle,
  graceDaysRemaining,
  lockedDaysRemaining,
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
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/designer/plan-billing">Update payment method</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (lifecycle === 'grace') {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Payment due</AlertTitle>
        <AlertDescription>
          <p>
            Your payment is overdue.
            {graceDaysRemaining != null ? daysRemainingCopy(graceDaysRemaining, 'grace') : null} Full
            access continues during this period.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/designer/plan-billing">Make payment</Link>
          </Button>
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
            Your subscription has been suspended due to non-payment.
            {lockedDaysRemaining != null
              ? daysRemainingCopy(lockedDaysRemaining, 'locked')
              : null}{' '}
            Reactivate to restore access to all workspace features.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/designer/plan-billing">Reactivate subscription</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
