import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BillingRecovery } from '@repo/contracts';
vi.mock('@/lib/api', () => ({ api: {} }));
import { SavedRecoveryNotice } from '../../src/components/subscribe/saved-recovery-notice';
const saved: BillingRecovery = {
  id: '06757c76-72c6-4fe5-b7b3-dfc9ca2a8524',
  organizationId: 'org',
  targetTier: 'corporate',
  sourceSubscriptionId: 'sub_source',
  actorId: 'user',
  status: 'eligible',
  eligibleAt: null,
  reason: 'source_subscription_terminated',
  revision: 1,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};
function notice(overrides: Partial<BillingRecovery> = {}) {
  render(
    <SavedRecoveryNotice
      recovery={{ ...saved, ...overrides }}
      onReview={vi.fn()}
      onDismissed={vi.fn()}
    />,
  );
}
describe('saved recovery status copy', () => {
  it('offers eligible checkout without describing an unknown end date or unavailable action', () => {
    notice();
    expect(screen.getByText('Ready to purchase.')).toBeInTheDocument();
    expect(
      screen.getByText(/Review your selected plan to continue to payment/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not yet confirmed|not available yet/)).not.toBeInTheDocument();
  });
  it('describes existing checkout without asking for another purchase', () => {
    notice({ status: 'checkout_pending', reason: null });
    expect(screen.getByText(/Your selected plan already has a checkout/)).toBeInTheDocument();
    expect(
      screen.queryByText(/confirm a new purchase|end date is not yet confirmed/),
    ).not.toBeInTheDocument();
  });
  it('explains why another activated plan superseded the saved selection', () => {
    notice({ status: 'superseded', reason: 'another_plan_activated' });
    expect(screen.getByText(/Another plan is now active/)).toBeInTheDocument();
    expect(screen.queryByText(/not available yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review plan' })).not.toBeInTheDocument();
  });
});
