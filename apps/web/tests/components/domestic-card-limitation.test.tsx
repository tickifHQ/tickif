/** E-289 restrictions are now preflighted before explicit durable recovery consent. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingChangePreview, BillingRecovery } from '@repo/contracts';

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  getRecovery: vi.fn(),
  saveRecovery: vi.fn(),
  changePlan: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock('@/lib/razorpay-checkout', () => ({ openRazorpayCheckout: mocks.checkout }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'change-preview': { $post: mocks.preview },
        recovery: { $get: mocks.getRecovery, $post: mocks.saveRecovery },
        'change-plan': { $post: mocks.changePlan },
        cancel: { $post: mocks.cancel },
      },
    },
  },
}));
import { CheckoutFlow } from '../../src/components/subscribe/checkout-flow';

const preview: BillingChangePreview = {
  organizationId: 'org',
  sourceSubscriptionId: 'sub_domestic',
  currentTier: 'professional_plus',
  targetTier: 'corporate',
  action: 'recover',
  timing: 'after_expiry',
  effectiveAt: '2026-10-01T00:00:00.000Z',
  nextRenewalAt: '2026-10-01T00:00:00.000Z',
  nextEligibleAction: 'subscribe',
  nextEligibleAt: '2026-10-01T00:00:00.000Z',
  reason: 'payment_mode_change_unsupported',
  recurringAmount: 799900,
  adjustmentAmount: 0,
  currency: 'INR',
  amountCertainty: 'confirmed',
  adjustmentDirection: 'none',
  confirmationAllowed: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  previewToken: 'signed-recovery-preview',
};
const recovery: BillingRecovery = {
  id: '06757c76-72c6-4fe5-b7b3-dfc9ca2a8524',
  organizationId: 'org',
  targetTier: 'corporate',
  sourceSubscriptionId: 'sub_domestic',
  actorId: 'user',
  status: 'waiting_for_expiry',
  eligibleAt: '2026-10-01T00:00:00.000Z',
  reason: null,
  revision: 2,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
};
function renderUpgrade() {
  return render(
    <CheckoutFlow
      open
      onOpenChange={() => {}}
      currentTier="professional_plus"
      lifecycleState="active"
      cancellationScheduled={false}
      currentPeriodEnd="2026-10-01T00:00:00.000Z"
      initialTargetTier="corporate"
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(Response.json(preview));
  mocks.getRecovery.mockResolvedValue(Response.json({ recovery: null }));
  mocks.saveRecovery.mockResolvedValue(Response.json({ recovery }));
});
describe('E-289: preflight payment-method limitations', () => {
  it('explains unsupported payment methods before submitting any plan change', async () => {
    renderUpgrade();
    expect(
      await screen.findByText(/Your payment method does not support this plan change/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Schedule cancellation and save target' }),
    ).toBeInTheDocument();
    expect(mocks.changePlan).not.toHaveBeenCalled();
    expect(mocks.saveRecovery).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('requires explicit deferred cancellation consent without claiming immediate access', async () => {
    renderUpgrade();
    expect(
      await screen.findByText(
        /Confirming schedules cancellation of your current paid subscription at the end/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/No replacement subscription is purchased now/)).toBeInTheDocument();
    expect(screen.queryByText('Plan activated')).not.toBeInTheDocument();
  });
  it('uses the signed durable recovery request and preserves the selected target', async () => {
    renderUpgrade();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Schedule cancellation and save target' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Recovery target saved' }),
    ).toBeInTheDocument();
    expect(mocks.saveRecovery).toHaveBeenCalledWith({
      json: {
        targetTier: 'corporate',
        previewToken: 'signed-recovery-preview',
        expectedRevision: null,
        operationId: expect.any(String),
      },
    });
    expect(
      screen.getByText(/Cancellation is scheduled; current access remains until 1 Oct 2026/),
    ).toBeInTheDocument();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('does not offer cancellation when the preview provider returns a genuine 502', async () => {
    mocks.preview.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    renderUpgrade();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify this plan change');
    expect(
      screen.queryByRole('button', { name: /schedule cancellation/i }),
    ).not.toBeInTheDocument();
    expect(mocks.saveRecovery).not.toHaveBeenCalled();
  });
  it('does not infer UPI capability from an upstream error description', async () => {
    mocks.preview.mockResolvedValue(
      Response.json(
        { error: { code: 'upstream_error', message: 'Razorpay error: payment mode is upi' } },
        { status: 502 },
      ),
    );
    renderUpgrade();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify this plan change');
    expect(
      screen.queryByRole('button', { name: /schedule cancellation/i }),
    ).not.toBeInTheDocument();
    expect(mocks.saveRecovery).not.toHaveBeenCalled();
  });
  it('shows an unconfirmed recovery outcome without claiming cancellation succeeded', async () => {
    mocks.saveRecovery.mockResolvedValue(
      Response.json({
        recovery: { ...recovery, status: 'requested', reason: 'provider_outcome_unconfirmed' },
      }),
    );
    renderUpgrade();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Schedule cancellation and save target' }),
    );
    expect(
      await screen.findByText(/provider has not yet confirmed cancellation/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cancellation is scheduled/)).not.toBeInTheDocument();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
