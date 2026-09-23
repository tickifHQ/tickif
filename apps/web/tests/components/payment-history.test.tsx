import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ payments: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { api: { billing: { payments: { $get: mocks.payments } } } } }));

import { PaymentHistory } from '../../src/components/payment-history';

const payment = (id: string) => ({
  id, amount: 799900, currency: 'INR', status: 'captured', occurredAt: '2026-09-23T10:00:00.000Z',
});

describe('PaymentHistory automatic synchronization', () => {
  beforeEach(() => { mocks.payments.mockReset(); });

  it('shows newly recorded payments on focus without a refresh control', async () => {
    let recorded = false;
    mocks.payments.mockImplementation(async () => Response.json({ items: recorded ? [payment('pay_new')] : [], nextOffset: null }));
    render(<PaymentHistory />);
    await screen.findByText('No payments recorded yet.');
    expect(screen.queryByRole('button', { name: /refresh payments|retry payments/i })).not.toBeInTheDocument();
    recorded = true;
    fireEvent(window, new Event('focus'));
    expect(await screen.findByText('pay_new')).toBeInTheDocument();
    expect(screen.getByText('captured')).toBeInTheDocument();
  });

  it('preserves loaded payment rows during a transient refresh failure', async () => {
    mocks.payments.mockImplementation(async () => Response.json({ items: [payment('pay_retained')], nextOffset: null }));
    render(<PaymentHistory />);
    await screen.findByText('pay_retained');
    mocks.payments.mockImplementation(async () => new Response(null, { status: 503 }));
    fireEvent(window, new Event('focus'));
    await screen.findByRole('alert');
    expect(screen.getByText('pay_retained')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry payments/i })).not.toBeInTheDocument();
  });

  it('does not let a delayed old-page response replace a new page', async () => {
    mocks.payments.mockImplementation(async ({ query }: { query: { offset: string } }) => Response.json({
      items: [payment(query.offset === '0' ? 'pay_first_page' : 'pay_second_page')],
      nextOffset: query.offset === '0' ? 20 : null,
    }));
    render(<PaymentHistory />);
    await screen.findByText('pay_first_page');
    let finishOld: ((value: Response) => void) | undefined;
    mocks.payments.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishOld = resolve; }));
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(finishOld).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Next payments' }));
    await screen.findByText('pay_second_page');
    await act(async () => { finishOld?.(Response.json({ items: [payment('pay_stale_response')], nextOffset: 20 })); });
    expect(screen.getByText('pay_second_page')).toBeInTheDocument();
    expect(screen.queryByText('pay_stale_response')).not.toBeInTheDocument();
  });
});
