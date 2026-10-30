'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Clock3, Loader2 } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { TickifBrandLogo } from '@/components/tickif-brand-logo';

/** Everything on the receipt comes from the billing API; missing values are left off. */
export interface CheckoutReceipt {
  planLabel: string;
  payment: { id: string; amount: number; currency: string; paidAt: string };
  studioName: string | null;
  subscriptionId: string | null;
  renewsAt: string | null;
}

export type CheckoutPrinterState =
  | { status: 'processing' }
  | { status: 'timed-out' }
  | { status: 'confirmed'; receipt: CheckoutReceipt };

const BILLING_PATH = '/designer/plan-billing';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function formatAmount({ amount, currency }: CheckoutReceipt['payment']) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount / 100);
}

// No timeZone option: dates print in the viewer's own time zone.
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

function ReceiptLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'font-medium text-card-foreground')}>
      <span>{label}</span>
      <span className="min-w-0 text-right wrap-anywhere">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-3 border-t border-dashed border-border" aria-hidden="true" />;
}

/**
 * A small receipt printer for the moment after checkout. It waits on the screen until
 * billing confirms the payment, then feeds out a paper receipt. Navigation is left to
 * the buttons underneath; nothing redirects on its own.
 */
export function CheckoutPrinter({
  state,
  planLabel,
}: {
  state: CheckoutPrinterState;
  planLabel: string;
}) {
  const [fed, setFed] = useState(prefersReducedMotion);
  const receipt = state.status === 'confirmed' ? state.receipt : null;
  const stage = receipt ? (fed ? 'complete' : 'printing') : state.status;

  return (
    <div className="mx-auto flex w-full max-w-80 flex-col">
      <div className="relative z-10 rounded-3xl bg-surface-inverse px-3 pb-7 pt-3 text-surface-inverse-foreground shadow-lg">
        <div className="flex h-7 items-center justify-between px-1">
          <TickifBrandLogo tone="inverse" />
          <span className="rounded-full bg-surface-inverse-foreground/10 px-2.5 py-1 text-xs">
            Billing
          </span>
        </div>
        <div className="mt-3 rounded-2xl bg-surface-inverse-foreground/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs opacity-70">Item</p>
              <p className="truncate text-sm font-medium">{planLabel} plan</p>
            </div>
            {receipt && (
              <div className="shrink-0 text-right">
                <p className="text-xs opacity-70">Total</p>
                <p className="text-sm font-medium">{formatAmount(receipt.payment)}</p>
              </div>
            )}
          </div>
          <p role="status" className="mt-3 flex min-h-4 items-start gap-2 text-xs leading-4">
            {stage === 'complete' ? (
              <Check className="size-4 shrink-0" aria-hidden="true" />
            ) : stage === 'timed-out' ? (
              <Clock3 className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Loader2
                className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {stage === 'processing'
              ? 'Confirming your payment'
              : stage === 'printing'
                ? 'Printing your receipt'
                : stage === 'complete'
                  ? 'Payment confirmed'
                  : 'Billing is still updating. Your plan changes once the payment is confirmed.'}
          </p>
        </div>
        <div className="absolute inset-x-6 bottom-3 h-1.5 rounded-full bg-surface-inverse-foreground/20" />
      </div>

      {/* Reserved height so the buttons below stay put while the paper feeds. */}
      <div
        className={cn(
          'relative mx-auto -mt-3 min-h-68 w-64 overflow-hidden drop-shadow-md',
          stage === 'timed-out' && 'invisible',
        )}
      >
        {receipt && (
          <article
            aria-label="Receipt"
            data-feeding={stage === 'printing' ? '' : undefined}
            onAnimationEnd={() => setFed(true)}
            className="checkout-receipt-paper bg-card px-4 pb-6 pt-7 font-mono text-xs leading-5 text-muted-foreground"
          >
            <div className="flex justify-center font-sans">
              <TickifBrandLogo />
            </div>
            <Divider />
            <ReceiptLine
              label={`${receipt.planLabel} plan`}
              value={formatAmount(receipt.payment)}
              strong
            />
            <ReceiptLine label="Paid" value={formatDateTime(receipt.payment.paidAt)} />
            <Divider />
            {receipt.studioName && <ReceiptLine label="Studio" value={receipt.studioName} />}
            <ReceiptLine label="Payment" value={receipt.payment.id} />
            {receipt.subscriptionId && (
              <ReceiptLine label="Subscription" value={receipt.subscriptionId} />
            )}
            {receipt.renewsAt && (
              <ReceiptLine label="Renews" value={formatDate(receipt.renewsAt)} />
            )}
          </article>
        )}
      </div>

      <div
        className={cn(
          'mt-4 flex justify-center',
          stage !== 'complete' && stage !== 'timed-out' && 'invisible',
        )}
      >
        <Button variant={stage === 'timed-out' ? 'outline' : 'fancy'} asChild>
          <Link href={BILLING_PATH}>{stage === 'timed-out' ? 'Close' : 'Go to billing'}</Link>
        </Button>
      </div>
    </div>
  );
}
