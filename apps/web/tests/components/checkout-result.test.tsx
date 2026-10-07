import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveEntitlements } from '@repo/contracts';
const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  context: vi.fn(),
  refresh: vi.fn(),
  poll: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        subscription: { $get: mocks.subscription, refresh: { $get: mocks.refresh } },
        'selection-context': { $get: mocks.context },
      },
    },
  },
}));
vi.mock('@/components/subscribe/use-billing-auto-refresh', async () => {
  const { useEffect } = await import('react');
  return {
    useBillingAutoRefresh: (refresh: () => Promise<void>) => {
      mocks.poll.mockImplementation(refresh);
      useEffect(() => {
        void refresh().catch(() => undefined);
      }, []);
      return refresh;
    },
  };
});
vi.mock('@/components/subscribe/checkout-flow', () => ({
  CheckoutFlow: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Review existing checkout</div> : null,
}));
import { CheckoutResult } from '../../src/components/subscribe/checkout-result';
const subscription = {
  tier: 'hobby',
  lifecycleState: 'active',
  preLapseTier: null,
  razorpayStatus: 'created',
  currentPeriodEnd: null,
  cancellationScheduled: false,
  seatUsage: 1,
  branchUsage: 1,
  entitlements: resolveEntitlements('hobby', 'active'),
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  frozenResources: [],
};
const context = {
  organizationId: 'org',
  currentTier: 'hobby',
  sourceSubscriptionId: 'sub_source',
  providerState: 'known',
  actions: [],
  recovery: null,
  scheduledChange: null,
  pendingOperation: null,
  unfinishedCheckout: {
    targetTier: 'professional_plus',
    status: 'created',
    razorpaySubscriptionId: 'sub_checkout',
  },
};
const props = {
  userId: 'user',
  organizationId: 'org',
  targetTier: 'professional_plus' as const,
  outcome: 'complete' as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(Response.json({}));
  mocks.subscription.mockImplementation(async () => Response.json(subscription));
  mocks.context.mockImplementation(async () => Response.json(context));
});
describe('checkout return pages', () => {
  it('confirms an upgrade fulfilled by the server while its renewal mandate starts next cycle', async () => {
    mocks.subscription.mockResolvedValue(
      Response.json({
        ...subscription,
        tier: 'corporate',
        razorpayStatus: 'authenticated',
        entitlements: resolveEntitlements('corporate', 'active'),
      }),
    );
    mocks.context.mockResolvedValue(
      Response.json({
        ...context,
        currentTier: 'corporate',
        unfinishedCheckout: null,
        actions: [
          {
            targetTier: 'corporate',
            action: 'current',
            reason: 'replacement_pending',
            effectiveAt: '2026-11-06T00:00:00.000Z',
          },
        ],
      }),
    );
    render(<CheckoutResult {...props} targetTier="corporate" />);
    expect(await screen.findByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.getByText('Your Corporate plan is now active.')).toBeInTheDocument();
  });

  it('does not treat an authenticated mandate alone as a fulfilled upgrade', async () => {
    mocks.subscription.mockResolvedValue(
      Response.json({
        ...subscription,
        tier: 'corporate',
        razorpayStatus: 'authenticated',
        entitlements: resolveEntitlements('corporate', 'active'),
      }),
    );
    mocks.context.mockResolvedValue(
      Response.json({ ...context, currentTier: 'corporate', unfinishedCheckout: null }),
    );
    render(<CheckoutResult {...props} targetTier="corporate" />);
    expect(
      await screen.findByRole('heading', { name: 'Confirming your payment' }),
    ).toBeInTheDocument();
  });
  it('resumes an unpaid replacement order after its renewal mandate is authorized', async () => {
    mocks.subscription.mockResolvedValue(
      Response.json({
        ...subscription,
        tier: 'professional_plus',
        razorpayStatus: 'active',
        entitlements: resolveEntitlements('professional_plus', 'active'),
      }),
    );
    mocks.context.mockResolvedValue(
      Response.json({
        ...context,
        currentTier: 'professional_plus',
        unfinishedCheckout: null,
        actions: [
          {
            targetTier: 'corporate',
            action: 'change_plan',
            reason: 'replacement_pending',
            effectiveAt: '2026-11-06T00:00:00.000Z',
          },
        ],
      }),
    );
    render(<CheckoutResult {...props} targetTier="corporate" outcome="closed" />);
    expect(await screen.findByRole('button', { name: 'Continue checkout' })).toBeInTheDocument();
    expect(screen.queryByText(/This checkout is no longer pending/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue checkout' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('offers plan selection instead of indefinite confirmation after an abandoned checkout expires', async () => {
    mocks.context.mockResolvedValue(Response.json({ ...context, unfinishedCheckout: null }));
    render(<CheckoutResult {...props} outcome="closed" />);
    expect(await screen.findByRole('heading', { name: 'Checkout closed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose your plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue checkout' })).not.toBeInTheDocument();
  });
  it('never confirms activation when provider state is unknown', async () => {
    mocks.subscription.mockResolvedValue(
      Response.json({
        ...subscription,
        tier: 'professional_plus',
        razorpayStatus: 'active',
        entitlements: resolveEntitlements('professional_plus', 'active'),
      }),
    );
    mocks.context.mockResolvedValue(
      Response.json({
        ...context,
        currentTier: 'professional_plus',
        providerState: 'unknown',
        unfinishedCheckout: null,
      }),
    );
    render(<CheckoutResult {...props} />);
    expect(
      await screen.findByRole('heading', { name: 'Confirming your payment' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payment confirmed' })).not.toBeInTheDocument();
  });
  it('keeps payment pending until matching server evidence confirms activation', async () => {
    render(<CheckoutResult {...props} />);
    expect(
      await screen.findByRole('heading', { name: 'Confirming your payment' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payment confirmed' })).not.toBeInTheDocument();
    mocks.subscription.mockResolvedValue(
      Response.json({
        ...subscription,
        tier: 'professional_plus',
        razorpayStatus: 'active',
        entitlements: resolveEntitlements('professional_plus', 'active'),
      }),
    );
    mocks.context.mockResolvedValue(
      Response.json({ ...context, currentTier: 'professional_plus', unfinishedCheckout: null }),
    );
    await act(async () => {
      await mocks.poll();
    });
    expect(await screen.findByRole('heading', { name: 'Payment confirmed' })).toBeInTheDocument();
    expect(screen.getByText('Your Professional+ plan is now active.')).toBeInTheDocument();
  });
  it('offers an explicit review of the same checkout when closed, without purchasing on mount', async () => {
    render(<CheckoutResult {...props} outcome="closed" />);
    expect(await screen.findByRole('heading', { name: 'Checkout closed' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue checkout' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Review existing checkout');
  });
  it('does not offer another payment while the provider is authenticating', async () => {
    mocks.context.mockResolvedValue(
      Response.json({
        ...context,
        unfinishedCheckout: { ...context.unfinishedCheckout, status: 'authenticated' },
      }),
    );
    render(<CheckoutResult {...props} outcome="closed" />);
    expect(
      await screen.findByRole('heading', { name: 'Confirming your payment' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue checkout' })).not.toBeInTheDocument();
  });
  it('rejects stale organization data and never claims success during an outage', async () => {
    mocks.context.mockResolvedValue(Response.json({ ...context, organizationId: 'other' }));
    render(<CheckoutResult {...props} />);
    expect(
      await screen.findByRole('heading', { name: 'Unable to confirm payment' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue checkout' })).not.toBeInTheDocument();
  });
  it('shows a scheduled transition without claiming the new plan is active', async () => {
    mocks.context.mockResolvedValue(
      Response.json({
        ...context,
        unfinishedCheckout: null,
        scheduledChange: {
          targetTier: 'professional_plus',
          effectiveAt: '2026-11-06T00:00:00.000Z',
        },
      }),
    );
    render(<CheckoutResult {...props} />);
    expect(
      await screen.findByRole('heading', { name: 'Plan change scheduled' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your current access continues until/)).toBeInTheDocument();
  });
});
