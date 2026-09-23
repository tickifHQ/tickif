import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingChangePreview } from '@repo/contracts';
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  subscribe: vi.fn(),
  change: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
  getRecovery: vi.fn(),
  saveRecovery: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'change-preview': { $post: mocks.preview },
        subscribe: { $post: mocks.subscribe },
        'change-plan': { $post: mocks.change },
        cancel: { $post: mocks.cancel },
        recovery: { $get: mocks.getRecovery, $post: mocks.saveRecovery },
      },
    },
  },
}));
vi.mock('@/lib/razorpay-checkout', () => ({ openRazorpayCheckout: mocks.checkout }));
vi.mock('@repo/ui/components/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { CheckoutFlow } from '../../src/components/subscribe/checkout-flow';
const preview: BillingChangePreview = {
  organizationId: 'org',
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
  recurringAmount: null,
  adjustmentAmount: null,
  currency: null,
  amountCertainty: 'unavailable',
  adjustmentDirection: 'unknown',
  confirmationAllowed: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  previewToken: 'signed-preview',
};
const base = {
  open: true,
  onOpenChange: vi.fn(),
  currentTier: 'hobby' as const,
  lifecycleState: 'active' as const,
  cancellationScheduled: false,
  currentPeriodEnd: null,
  initialTargetTier: 'corporate' as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue({ ok: true, json: async () => preview });
});
describe('billing preview checkout regressions', () => {
  it('honors explicit Corporate selection over previous Professional+ recovery', async () => {
    render(<CheckoutFlow {...base} lifecycleState="downgraded" restoreTier="professional_plus" />);
    await waitFor(() =>
      expect(mocks.preview).toHaveBeenCalledWith({ json: { targetTier: 'corporate' } }),
    );
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it('routes an initial lower target to downgrade review', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...preview,
        currentTier: 'corporate',
        targetTier: 'professional_plus',
        action: 'change_plan',
        timing: 'cycle_end',
      }),
    });
    render(
      <CheckoutFlow {...base} currentTier="corporate" initialTargetTier="professional_plus" />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Downgrade to Professional+' }),
    ).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it('rechecks a cancellation-scheduled initial target and blocks payment', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...preview,
        action: 'blocked',
        confirmationAllowed: false,
        reason: 'cancellation_scheduled',
        timing: 'after_expiry',
      }),
    });
    render(<CheckoutFlow {...base} cancellationScheduled />);
    await screen.findByText(/current subscription ends/i);
    expect(screen.queryByRole('button', { name: 'Proceed to Checkout' })).not.toBeInTheDocument();
  });
  it('requires renewed review after stale preview without resubmitting', async () => {
    mocks.subscribe.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'preview_stale', message: 'Changed' } }),
    });
    render(<CheckoutFlow {...base} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Proceed to Checkout' }));
    expect(await screen.findByText(/review.*again/i)).toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retry Corporate' }));
    expect(await screen.findByRole('button', { name: 'Proceed to Checkout' })).toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });
  it('discloses cancellation before saving a durable recovery target', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...preview,
        action: 'recover',
        reason: 'amount_authorization_unavailable',
      }),
    });
    mocks.getRecovery.mockResolvedValue({ ok: true, json: async () => ({ recovery: null }) });
    render(<CheckoutFlow {...base} currentTier="professional_plus" />);
    expect(
      await screen.findByRole('button', { name: 'Schedule cancellation and save target' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Confirming schedules cancellation/)).toBeInTheDocument();
    expect(mocks.saveRecovery).not.toHaveBeenCalled();
  });
  it('does not allow saving a recovery action rejected by the preview', async () => {
    mocks.preview.mockResolvedValue({
      ok: true,
      json: async () => ({ ...preview, action: 'recover', confirmationAllowed: false }),
    });
    mocks.getRecovery.mockResolvedValue({ ok: true, json: async () => ({ recovery: null }) });
    render(<CheckoutFlow {...base} currentTier="professional_plus" />);
    await screen.findByRole('heading', { name: 'Upgrade to Corporate' });
    expect(
      screen.queryByRole('button', { name: 'Schedule cancellation and save target' }),
    ).not.toBeInTheDocument();
  });
  it('retains the selected target when Razorpay is dismissed', async () => {
    mocks.subscribe.mockResolvedValue({
      ok: true,
      json: async () => ({
        razorpayKeyId: 'test',
        razorpaySubscriptionId: 'sub_corporate',
        shortUrl: null,
        prefill: { name: null, email: null, contact: null },
        operationId: 'b8f77fda-7c77-4f7e-94ec-6efc8f6dc143',
        outcome: 'processing',
        targetTier: 'corporate',
        effectiveAt: null,
      }),
    });
    mocks.checkout.mockImplementation(async ({ onDismiss }: { onDismiss: () => void }) =>
      onDismiss(),
    );
    render(<CheckoutFlow {...base} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Proceed to Checkout' }));
    expect(await screen.findByRole('button', { name: 'Retry Corporate' })).toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledWith({
      json: expect.objectContaining({ targetTier: 'corporate', previewToken: 'signed-preview' }),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('ignores a stale preview completing after organization change', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    mocks.preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { rerender } = render(<CheckoutFlow {...base} scopeKey="org-a" />);
    rerender(<CheckoutFlow {...base} scopeKey="org-b" initialTargetTier="professional_plus" />);
    resolveFirst?.({ ok: true, json: async () => preview });
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Upgrade to Corporate' })).not.toBeInTheDocument();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
