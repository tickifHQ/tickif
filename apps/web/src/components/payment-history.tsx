'use client';

import { useCallback, useState } from 'react';
import { billingPaymentsResponseSchema, type BillingPaymentsResponse } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { Button } from '@repo/ui/components/button';
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
    <Card radius="2xl">
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
        <CardDescription>
          Payments recorded from Razorpay. Recent payments can take a moment to appear.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              We could not update your payments. We will try again automatically.
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status">Loading payments…</p>
        ) : data?.items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {new Intl.DateTimeFormat('en-IN', {
                      dateStyle: 'medium',
                      timeZone: 'Asia/Kolkata',
                    }).format(new Date(payment.occurredAt))}
                  </TableCell>
                  <TableCell className="font-mono">{payment.id}</TableCell>
                  <TableCell>
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: payment.currency,
                    }).format(payment.amount / 100)}
                  </TableCell>
                  <TableCell>{payment.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : data ? (
          <p>No payments recorded yet.</p>
        ) : null}
        <div data-testid="payment-history-controls" className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous payments
          </Button>
          <Button
            variant="outline"
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
