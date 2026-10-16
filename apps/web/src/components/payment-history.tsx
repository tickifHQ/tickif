'use client';

import { useCallback, useState } from 'react';
import { billingPaymentsResponseSchema, type BillingPaymentsResponse } from '@repo/contracts';
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/card';
import { Button } from '@repo/ui/components/button';
import { Badge } from '@repo/ui/components/badge';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Receipt } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/table';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { api } from '@/lib/api';
import { useBillingAutoRefresh } from './subscribe/use-billing-auto-refresh';

export function PaymentHistory() {
  const [offset, setOffset] = useState(0);
  return <PaymentHistoryPage key={offset} offset={offset} setOffset={setOffset} />;
}

function PaymentHistoryPage({
  offset,
  setOffset,
}: {
  offset: number;
  setOffset: (offset: number) => void;
}) {
  const [data, setData] = useState<BillingPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await api.api.billing.payments.$get({
        query: { offset: String(offset), limit: '20' },
      });
      if (!response.ok) throw new Error('Unable to load payments');
      const parsed = billingPaymentsResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('Invalid payment history');
      setData(parsed.data);
      setError(false);
    } catch {
      setError(true);
      throw new Error('Payment history unavailable');
    } finally {
      setLoading(false);
    }
  }, [offset]);
  useBillingAutoRefresh(load, { urgent: error });
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="gap-2 p-6 pb-0">
        <h2 className="font-sans text-lg font-medium tracking-normal text-foreground">
          Payment history
        </h2>
        <CardDescription>
          Payments recorded from Razorpay. Recent payments can take a moment to appear.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              We could not update your payments. We will try again automatically.
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading payments…
          </p>
        ) : data?.items.length ? (
          <Table aria-label="Payment history">
            <TableHeader>
              <TableRow>
                <TableHead className="font-sans text-sm tracking-normal">Date</TableHead>
                <TableHead className="font-sans text-sm tracking-normal">Payment</TableHead>
                <TableHead className="text-right font-sans text-sm tracking-normal">
                  Amount
                </TableHead>
                <TableHead className="font-sans text-sm tracking-normal">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap">
                    {new Intl.DateTimeFormat('en-IN', {
                      dateStyle: 'medium',
                      timeZone: 'Asia/Kolkata',
                    }).format(new Date(payment.occurredAt))}
                  </TableCell>
                  <TableCell className="break-all">{payment.id}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: payment.currency,
                    }).format(payment.amount / 100)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{payment.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : data ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="No payments recorded yet."
            className="max-w-none py-8 [&_h2]:font-sans [&_h2]:tracking-normal"
          />
        ) : null}
        <div data-testid="payment-history-controls" className="flex flex-wrap justify-end gap-2">
          <Button
            variant="neutral"
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous payments
          </Button>
          <Button
            variant="neutral"
            size="sm"
            disabled={loading || error || data?.nextOffset == null}
            onClick={() => setOffset(data?.nextOffset ?? offset)}
          >
            Next payments
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
