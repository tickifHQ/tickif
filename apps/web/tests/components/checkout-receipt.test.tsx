import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { resolveEntitlements } from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  context: vi.fn(),
  refresh: vi.fn(),
  payments: vi.fn(),
  poll: vi.fn(),
}));
vi.mock('@/components/workspace-entitlement-sync', () => ({
  useWorkspaceEntitlementSync: () => vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        subscription: { $get: mocks.subscription, refresh: { $get: mocks.refresh } },
        'selection-context': { $get: mocks.context },
        payments: { $get: mocks.payments },
      },
    },
  },
}));
vi.mock('@/components/subscribe/use-billing-auto-refresh', async () => {
  const { useEffect } = await import('react');
  return {
    useBillingAutoRefresh: (refresh: () => Promise<void>, options: { enabled?: boolean }) => {
      mocks.poll.mockImplementation(refresh);
      useEffect(() => {
        if (options.enabled !== false) void refresh().catch(() => undefined);
      }, [options.enabled]);
      return refresh;
    },
  };
});

import { CheckoutResult } from '../../src/components/subscribe/checkout-result';
import { rememberCheckoutPayment } from '../../src/components/subscribe/checkout-payment';

const pending = {
  tier: 'hobby',
  lifecycleState: 'active',
  preLapseTier: null,
  razorpayStatus: 'created',
  razorpaySubscriptionId: 'sub_RcPro123' as string | null,
  currentPeriodEnd: null as string | null,
  cancellationScheduled: false,
  seatUsage: 1,
  branchUsage: 1,
  entitlements: resolveEntitlements('hobby', 'active'),
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  frozenResources: [],
};
const active = {
  ...pending,
  tier: 'professional_plus',
  razorpayStatus: 'active',
  currentPeriodEnd: '2026-11-30T06:30:00.000Z',
  entitlements: resolveEntitlements('professional_plus', 'active'),
};
const context = {
  organizationId: 'org',
  currentTier: 'professional_plus',
  sourceSubscriptionId: 'sub_RcPro123',
  providerState: 'known',
  actions: [],
  recovery: null,
  scheduledChange: null,
  pendingOperation: null,
  unfinishedCheckout: null,
};
const capturedPayment = {
  id: 'pay_RcReceipt42',
  amount: 299900,
  currency: 'INR',
  status: 'captured',
  occurredAt: '2026-10-30T09:15:00.000Z',
};
const props = {
  userId: 'user',
  organizationId: 'org',
  targetTier: 'professional_plus' as const,
  outcome: 'complete' as const,
  studioName: 'Studio Kaveri',
};

function confirmPayment({
  subscription = active,
  payments = [capturedPayment],
}: { subscription?: typeof pending; payments?: (typeof capturedPayment)[] } = {}) {
  mocks.subscription.mockImplementation(async () => Response.json(subscription));
  mocks.context.mockImplementation(async () =>
    Response.json({ ...context, currentTier: subscription.tier }),
  );
  mocks.payments.mockImplementation(async () =>
    Response.json({ items: payments, nextOffset: null }),
  );
}

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  prefersReducedMotion(false);
  mocks.refresh.mockResolvedValue(Response.json({}));
  confirmPayment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('checkout receipt printer', () => {
  it('prints the receipt only after the payment is confirmed', async () => {
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.getByRole('status')).toHaveTextContent('Printing your receipt');
    const receipt = screen.getByRole('article', { name: 'Receipt' });
    fireEvent.animationEnd(receipt);

    expect(screen.getByRole('status')).toHaveTextContent('Payment confirmed');
    expect(receipt).toHaveTextContent('Professional+ plan');
    expect(receipt).toHaveTextContent('₹2,999.00');
    expect(receipt).toHaveTextContent('Studio Kaveri');
    expect(receipt).toHaveTextContent('pay_RcReceipt42');
    expect(receipt).toHaveTextContent('sub_RcPro123');
    expect(receipt).toHaveTextContent('Renews');
    expect(screen.getByRole('link', { name: 'Go to billing' })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
    expect(screen.queryByRole('heading', { name: 'Payment confirmed' })).not.toBeInTheDocument();
  });

  it('keeps processing while the plan is active but the captured payment has not landed', async () => {
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    confirmPayment({ payments: [{ ...capturedPayment, id: 'pay_older' }] });
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.getByRole('status')).toHaveTextContent('Confirming your payment');
    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();

    confirmPayment();
    await act(async () => {
      await mocks.poll();
    });
    expect(screen.getByRole('article', { name: 'Receipt' })).toBeInTheDocument();
  });

  it('does not print an authorized payment that was never captured', async () => {
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    confirmPayment({ payments: [{ ...capturedPayment, status: 'failed' }] });
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
  });

  it('says billing is still updating after 30 seconds without confirmation', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    confirmPayment({ subscription: pending, payments: [] });
    render(<CheckoutResult {...props} />);
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Confirming your payment');

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Billing is still updating');
    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );

    confirmPayment();
    await act(async () => {
      await mocks.poll();
    });
    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
  });

  it('shows the finished receipt without the feed when motion is reduced', async () => {
    prefersReducedMotion(true);
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.getByRole('status')).toHaveTextContent('Payment confirmed');
    expect(screen.getByRole('article', { name: 'Receipt' })).not.toHaveAttribute('data-feeding');
  });

  it('leaves out lines the backend did not return', async () => {
    prefersReducedMotion(true);
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    confirmPayment({
      subscription: { ...active, razorpaySubscriptionId: null, currentPeriodEnd: null },
    });
    render(<CheckoutResult {...props} studioName={null} />);
    await flush();

    const receipt = screen.getByRole('article', { name: 'Receipt' });
    expect(receipt).toHaveTextContent('₹2,999.00');
    expect(receipt).not.toHaveTextContent('Studio');
    expect(receipt).not.toHaveTextContent('Subscription');
    expect(receipt).not.toHaveTextContent('Renews');
  });

  it.each([
    ['no payment from this tab', () => undefined],
    ['a payment for another plan', () => rememberCheckoutPayment('corporate', 'pay_RcReceipt42')],
  ])('keeps the plain confirmation for %s', async (_case, remember) => {
    remember();
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.getByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it('ignores a payment remembered more than an hour ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    vi.setSystemTime(Date.now() + 61 * 60_000);
    render(<CheckoutResult {...props} />);
    await flush();

    expect(screen.getByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
  });

  it('never prints on a closed checkout', async () => {
    rememberCheckoutPayment('professional_plus', 'pay_RcReceipt42');
    confirmPayment({ subscription: pending, payments: [] });
    render(<CheckoutResult {...props} outcome="closed" />);
    await flush();

    expect(screen.queryByRole('article', { name: 'Receipt' })).not.toBeInTheDocument();
    expect(mocks.payments).not.toHaveBeenCalled();
  });
});
