import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveEntitlements } from '@repo/contracts';

const mocks = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        subscription: {
          refresh: { $get: vi.fn(async () => Response.json({})) },
          $get: vi.fn(async () =>
            Response.json({
              tier: 'hobby',
              lifecycleState: 'active',
              preLapseTier: null,
              razorpayStatus: null,
              currentPeriodEnd: null,
              cancellationScheduled: false,
              seatUsage: 1,
              branchUsage: 1,
              graceDaysRemaining: null,
              lockedDaysRemaining: null,
              frozenResources: [],
              entitlements: resolveEntitlements('hobby', 'active'),
            }),
          ),
        },
        'selection-context': {
          $get: vi.fn(async () =>
            Response.json({
              organizationId: 'org-review',
              currentTier: 'hobby',
              sourceSubscriptionId: null,
              providerState: 'known',
              unfinishedCheckout: null,
              recovery: null,
              pendingOperation: null,
              scheduledChange: null,
              actions: ['professional_plus', 'corporate'].map((targetTier) => ({
                targetTier,
                action: 'subscribe',
                reason: null,
                effectiveAt: null,
              })),
            }),
          ),
        },
        'change-preview': { $post: mocks.preview },
        recovery: { $get: vi.fn(async () => Response.json({ recovery: null })) },
      },
    },
  },
}));

import { SubscribePage } from '../../src/components/subscribe/subscribe-page';

beforeEach(() => {
  mocks.preview.mockResolvedValue(
    Response.json({
      organizationId: 'org-review',
      sourceSubscriptionId: null,
      currentTier: 'hobby',
      targetTier: 'corporate',
      action: 'subscribe',
      timing: 'now',
      effectiveAt: null,
      nextRenewalAt: null,
      nextEligibleAction: null,
      nextEligibleAt: null,
      reason: null,
      recurringAmount: 799900,
      adjustmentAmount: null,
      currency: 'INR',
      amountCertainty: 'unavailable',
      adjustmentDirection: 'unknown',
      confirmationAllowed: true,
      expiresAt: '2099-01-01T00:00:00.000Z',
      previewToken: 'review-token',
    }),
  );
});

describe('pricing subpage and confirmation dialog', () => {
  it.each(['close button', 'escape'] as const)(
    'keeps pricing outside the review dialog and restores options/focus after %s',
    async (close) => {
      const user = userEvent.setup();
      render(<SubscribePage userId="user-review" organizationId="org-review" />);
      const table = await screen.findByRole('table', { name: 'Compare plan features' });
      const upgrade = screen.getByRole('button', { name: 'Upgrade to Corporate' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(upgrade);
      const dialog = await screen.findByRole('dialog', { name: 'Plan subscription' });
      await within(dialog).findByRole('button', { name: 'Continue to payment' });
      expect(table).toBeInTheDocument();
      expect(dialog.contains(table)).toBe(false);
      expect(within(dialog).queryByRole('table')).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('heading', { name: 'Choose your plan' }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Choose another plan' }),
      ).not.toBeInTheDocument();
      if (close === 'escape') await user.keyboard('{Escape}');
      else await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Upgrade to Corporate' })).toBeEnabled();
      expect(screen.queryByText('Selected', { exact: true })).not.toBeInTheDocument();
      await waitFor(() => expect(upgrade).toHaveFocus());
    },
  );
});
