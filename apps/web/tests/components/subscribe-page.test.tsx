import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  resolveEntitlements,
  type SubscriptionResponse,
  type SubscriptionState,
} from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  paymentMethod: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'payment-method': { $post: mocks.paymentMethod },
        subscription: { $get: mocks.getSubscription },
      },
    },
  },
}));

vi.mock('@/lib/razorpay-checkout', () => ({
  openRazorpayCheckout: vi.fn(),
}));

import { SubscribePage } from '../../src/components/subscribe/subscribe-page';

function subscription(lifecycleState: SubscriptionState): SubscriptionResponse {
  const tier = lifecycleState === 'downgraded' ? 'hobby' : 'corporate';
  return {
    tier,
    lifecycleState,
    preLapseTier: lifecycleState === 'downgraded' ? 'corporate' : null,
    razorpayStatus: lifecycleState === 'locked' ? 'halted' : 'active',
    currentPeriodEnd: null,
    cancellationScheduled: false,
    seatUsage: 1,
    branchUsage: 1,
    graceDaysRemaining: null,
    lockedDaysRemaining: null,
    frozenResources: [],
    entitlements: resolveEntitlements(tier, lifecycleState),
  };
}

describe('SubscribePage support recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['locked', 'downgraded'] as const)(
    'links the %s lifecycle recovery notice to WhatsApp Business',
    async (lifecycleState) => {
      mocks.getSubscription.mockResolvedValue(Response.json(subscription(lifecycleState)));
      render(<SubscribePage />);

      const supportLink = await screen.findByRole('link', { name: /contact support/i });
      expect(supportLink).toHaveAttribute('href', 'https://wa.me/919994645911');
      expect(supportLink).toHaveAttribute('target', '_blank');
      expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer');
    },
  );

  it('links a failed payment recovery attempt to WhatsApp Business', async () => {
    const user = userEvent.setup();
    mocks.getSubscription.mockResolvedValue(Response.json(subscription('payment_failed')));
    mocks.paymentMethod.mockResolvedValue(new Response(null, { status: 409 }));
    render(<SubscribePage />);

    await screen.findByText('Payment Issue');
    await user.click(screen.getByRole('button', { name: 'Update Payment Method' }));

    const supportLink = await screen.findByRole('link', { name: /contact support/i });
    expect(supportLink).toHaveAttribute('href', 'https://wa.me/919994645911');
    expect(supportLink).toHaveAttribute('target', '_blank');
    expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
