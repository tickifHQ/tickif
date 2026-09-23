import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  resolveEntitlements,
  type BillingChangePreview,
  type BillingRecovery,
  type PlanTier,
} from '@repo/contracts';
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  subscribe: vi.fn(),
  change: vi.fn(),
  cancel: vi.fn(),
  checkout: vi.fn(),
  getRecovery: vi.fn(),
  saveRecovery: vi.fn(),
  refresh: vi.fn(),
  subscription: vi.fn(),
  context: vi.fn(),
  autoSync:
    vi.fn<
      (refresh: () => Promise<void>, options: { enabled?: boolean; urgent?: boolean }) => void
    >(),
}));
vi.mock('@/components/subscribe/use-billing-auto-refresh', () => ({
  useBillingAutoRefresh: mocks.autoSync,
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
        subscription: { $get: mocks.subscription, refresh: { $get: mocks.refresh } },
        'selection-context': { $get: mocks.context },
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
  mocks.refresh.mockResolvedValue(Response.json({}));
});

function currentSubscription(tier: PlanTier) {
  return {
    tier,
    lifecycleState: 'active',
    preLapseTier: null,
    razorpayStatus: 'active',
    currentPeriodEnd: null,
    cancellationScheduled: false,
    seatUsage: 1,
    branchUsage: 1,
    entitlements: resolveEntitlements(tier, 'active'),
    graceDaysRemaining: null,
    lockedDaysRemaining: null,
    frozenResources: [],
  };
}
function context(tier: PlanTier, recovery: BillingRecovery | null = null) {
  return {
    organizationId: 'org',
    currentTier: tier,
    sourceSubscriptionId: 'sub_source',
    providerState: 'known',
    actions: [],
    recovery,
    scheduledChange: null,
    pendingOperation: null,
    unfinishedCheckout: null,
  };
}
describe('billing preview checkout regressions', () => {
  it('automatically resolves pending activation with GETs and never repeats checkout or preview', async () => {
    mocks.subscribe.mockRejectedValue(new Error('Connection interrupted'));
    render(<CheckoutFlow {...base} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
    await screen.findByRole('heading', { name: 'Confirmation pending' });
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
    mocks.subscription.mockResolvedValue(Response.json(currentSubscription('corporate')));
    mocks.context.mockResolvedValue(Response.json(context('corporate')));
    const sync = mocks.autoSync.mock.lastCall;
    expect(sync?.[1]).toMatchObject({ enabled: true, urgent: true });
    await act(async () => {
      await sync?.[0]();
    });
    expect(await screen.findByRole('heading', { name: 'Plan activated' })).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it('waits for unresolved provider state even when the cached plan matches', async () => {
    mocks.subscribe.mockRejectedValue(new Error('Connection interrupted'));
    render(<CheckoutFlow {...base} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
    await screen.findByRole('heading', { name: 'Confirmation pending' });
    mocks.subscription.mockImplementation(async () =>
      Response.json(currentSubscription('corporate')),
    );
    for (const unresolved of [
      { providerState: 'unknown' },
      {
        pendingOperation: {
          operationId: 'b8f77fda-7c77-4f7e-94ec-6efc8f6dc143',
          targetTier: 'corporate',
          status: 'processing',
          reason: 'reconciliation_pending',
        },
      },
      {
        unfinishedCheckout: {
          targetTier: 'corporate',
          status: 'authenticated',
          razorpaySubscriptionId: 'sub_corporate',
        },
      },
    ]) {
      mocks.context.mockResolvedValue(Response.json({ ...context('corporate'), ...unresolved }));
      await act(async () => {
        await mocks.autoSync.mock.lastCall?.[0]();
      });
      expect(screen.getByRole('heading', { name: 'Confirmation pending' })).toBeInTheDocument();
    }
  });
  it('recovers a lost save response only for the reviewed target and source', async () => {
    const saved: BillingRecovery = {
      id: '06757c76-72c6-4fe5-b7b3-dfc9ca2a8524',
      organizationId: 'org',
      targetTier: 'corporate',
      sourceSubscriptionId: 'sub_source',
      actorId: 'user',
      status: 'waiting_for_expiry',
      eligibleAt: null,
      reason: null,
      revision: 1,
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    };
    mocks.preview.mockResolvedValue(
      Response.json({ ...preview, action: 'recover', sourceSubscriptionId: 'sub_source' }),
    );
    mocks.getRecovery.mockResolvedValue(Response.json({ recovery: null }));
    mocks.saveRecovery.mockRejectedValue(new Error('Connection interrupted'));
    render(<CheckoutFlow {...base} currentTier="professional_plus" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel & save plan' }));
    await screen.findByRole('heading', { name: 'Confirmation pending' });
    mocks.subscription.mockImplementation(async () =>
      Response.json(currentSubscription('professional_plus')),
    );
    mocks.context.mockResolvedValue(
      Response.json(
        context('professional_plus', { ...saved, sourceSubscriptionId: 'other_subscription' }),
      ),
    );
    await act(async () => {
      await mocks.autoSync.mock.lastCall?.[0]();
    });
    expect(screen.getByRole('heading', { name: 'Confirmation pending' })).toBeInTheDocument();
    mocks.context.mockResolvedValue(Response.json(context('professional_plus', saved)));
    await act(async () => {
      await mocks.autoSync.mock.lastCall?.[0]();
    });
    expect(await screen.findByRole('heading', { name: 'Plan saved' })).toBeInTheDocument();
    expect(mocks.saveRecovery).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });
  it('updates the accepted recovery in place without adopting a different saved target', async () => {
    const saved: BillingRecovery = {
      id: '06757c76-72c6-4fe5-b7b3-dfc9ca2a8524',
      organizationId: 'org',
      targetTier: 'corporate',
      sourceSubscriptionId: 'sub_source',
      actorId: 'user',
      status: 'requested',
      eligibleAt: null,
      reason: null,
      revision: 1,
      createdAt: '2026-09-23T00:00:00.000Z',
      updatedAt: '2026-09-23T00:00:00.000Z',
    };
    mocks.preview.mockResolvedValue(
      Response.json({
        ...preview,
        action: 'recover',
        sourceSubscriptionId: saved.sourceSubscriptionId,
      }),
    );
    mocks.getRecovery.mockResolvedValue(Response.json({ recovery: null }));
    mocks.saveRecovery.mockResolvedValue(Response.json({ recovery: saved }));
    render(<CheckoutFlow {...base} currentTier="professional_plus" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel & save plan' }));
    await screen.findByRole('heading', { name: 'Plan saved' });
    mocks.subscription.mockImplementation(async () => Response.json(currentSubscription('hobby')));
    mocks.context.mockResolvedValue(
      Response.json(context('hobby', { ...saved, status: 'eligible', revision: 2 })),
    );
    await act(async () => {
      await mocks.autoSync.mock.lastCall?.[0]();
    });
    expect(await screen.findByRole('button', { name: 'Review Corporate' })).toBeInTheDocument();
    mocks.context.mockResolvedValue(
      Response.json(context('hobby', { ...saved, targetTier: 'professional_plus', revision: 3 })),
    );
    await act(async () => {
      await mocks.autoSync.mock.lastCall?.[0]();
    });
    expect(await screen.findByText(/saved plan changed elsewhere/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Corporate' })).not.toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.saveRecovery).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
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
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose another plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
  it('requires renewed review after stale preview without resubmitting', async () => {
    mocks.subscribe.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'preview_stale', message: 'Changed' } }),
    });
    render(<CheckoutFlow {...base} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByText(/review.*again/i)).toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retry Corporate' }));
    expect(await screen.findByRole('button', { name: 'Continue to payment' })).toBeInTheDocument();
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
    expect(await screen.findByRole('button', { name: 'Cancel & save plan' })).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Cancel & save plan' })).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
    expect(await screen.findByRole('button', { name: 'Continue checkout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose another plan' })).not.toBeInTheDocument();
    expect(mocks.subscribe).toHaveBeenCalledWith({
      json: expect.objectContaining({ targetTier: 'corporate', previewToken: 'signed-preview' }),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.autoSync.mock.lastCall?.[1].enabled).toBe(true);
    mocks.subscription.mockResolvedValue(Response.json(currentSubscription('corporate')));
    mocks.context.mockResolvedValue(Response.json(context('corporate')));
    await act(async () => {
      await mocks.autoSync.mock.lastCall?.[0]();
    });
    expect(await screen.findByRole('heading', { name: 'Plan activated' })).toBeInTheDocument();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
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
