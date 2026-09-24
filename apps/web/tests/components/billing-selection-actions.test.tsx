import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingRecovery, BillingSelectionContext } from '@repo/contracts';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { api: { billing: { 'selection-context': { $get: mocks.get } } } },
}));
import { useSelectionContext } from '../../src/components/subscribe/use-selection-context';

const recovery: BillingRecovery = {
  id: 'b81a87f4-f765-4a40-9e84-bdca02f83c56',
  organizationId: 'org-a',
  targetTier: 'professional_plus',
  sourceSubscriptionId: 'sub_source',
  actorId: 'actor-a',
  status: 'waiting_for_expiry',
  eligibleAt: '2026-10-01T00:00:00.000Z',
  reason: 'cancellation_scheduled',
  revision: 1,
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

const context = (overrides: Partial<BillingSelectionContext> = {}): BillingSelectionContext => ({
  organizationId: 'org-a',
  currentTier: 'corporate',
  sourceSubscriptionId: 'sub_source',
  providerState: 'known',
  recovery: null,
  pendingOperation: null,
  unfinishedCheckout: null,
  scheduledChange: null,
  actions: [
    { targetTier: 'hobby', action: 'cancel', reason: null, effectiveAt: null },
    { targetTier: 'professional_plus', action: 'change_plan', reason: null, effectiveAt: null },
    { targetTier: 'corporate', action: 'current', reason: null, effectiveAt: null },
  ],
  ...overrides,
});

async function load(value: BillingSelectionContext) {
  mocks.get.mockImplementation(async () => Response.json(value));
  const hook = renderHook(() => useSelectionContext('org-a'));
  await act(async () => {
    await hook.result.current.refreshContext();
  });
  return hook.result.current.actions;
}

describe('pricing action presentation', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it.each(['requested', 'waiting_for_expiry', 'eligible', 'checkout_pending'] as const)(
    'uses the server saved target for comparison while recovery is %s',
    async (status) => {
      mocks.get.mockImplementation(async () =>
        Response.json(context({ recovery: { ...recovery, status } })),
      );
      const hook = renderHook(() => useSelectionContext('org-a'));
      await act(async () => {
        await hook.result.current.refreshContext();
      });
      expect(hook.result.current).toMatchObject({ savedTargetTier: 'professional_plus' });
    },
  );

  it.each(['completed', 'dismissed', 'superseded'] as const)(
    'does not override a new selection with a %s recovery target',
    async (status) => {
      mocks.get.mockImplementation(async () =>
        Response.json(context({ recovery: { ...recovery, status } })),
      );
      const hook = renderHook(() => useSelectionContext('org-a'));
      await act(async () => {
        await hook.result.current.refreshContext();
      });
      expect(hook.result.current).toMatchObject({ savedTargetTier: null });
    },
  );

  it('leaves valid normal plan reviews enabled', async () => {
    const actions = await load(context());
    expect(actions.professional_plus?.disabled).toBe(false);
    expect(actions.professional_plus?.hidden).not.toBe(true);
    expect(actions.hobby?.disabled).toBe(false);
  });

  it.each(['created', 'authenticated'])(
    'keeps %s checkout continuation exclusively in the status notice',
    async (status) => {
      const actions = await load(
        context({
          unfinishedCheckout: {
            targetTier: 'professional_plus',
            status,
            razorpaySubscriptionId: 'sub_checkout',
          },
        }),
      );
      for (const action of Object.values(actions))
        expect(action).toMatchObject({ disabled: true, hidden: true });
      expect(actions.professional_plus?.reason).toBeTruthy();
    },
  );

  it.each(['requested', 'waiting_for_expiry', 'checkout_pending'] as const)(
    'hides purchase controls while recovery is %s',
    async (status) => {
      const actions = await load(
        context({
          recovery: { ...recovery, status },
          actions: context().actions.map((action) => ({
            ...action,
            action: 'blocked',
            reason: 'billing_period_unverified',
          })),
        }),
      );
      for (const action of Object.values(actions))
        expect(action).toMatchObject({ disabled: true, hidden: true });
      expect(actions.professional_plus?.reason).toBeTruthy();
      if (status === 'waiting_for_expiry')
        expect(actions.professional_plus?.reason).toContain('1 Oct 2026');
    },
  );

  it('allows a verified replacement plan change while a previous recovery intent waits for expiry', async () => {
    const actions = await load(context({ recovery }));
    expect(actions.professional_plus).toMatchObject({ disabled: false, hidden: false });
  });

  it('keeps cancellation available when the server allows it during a scheduled replacement', async () => {
    const actions = await load(
      context({
        scheduledChange: {
          targetTier: 'professional_plus',
          effectiveAt: '2026-10-01T00:00:00.000Z',
        },
        actions: context().actions.map((action) =>
          action.targetTier === 'hobby' ? action : { ...action, action: 'blocked' },
        ),
      }),
    );
    expect(actions.hobby).toMatchObject({ disabled: false, hidden: false });
    expect(actions.professional_plus?.disabled).toBe(true);
  });

  it('keeps the eligible saved target review only in the notice without blocking other valid choices', async () => {
    const actions = await load(context({ recovery: { ...recovery, status: 'eligible' } }));
    expect(actions.professional_plus).toMatchObject({ hidden: true, disabled: false });
    expect(actions.hobby).toMatchObject({ disabled: false });
    expect(actions.hobby?.hidden).not.toBe(true);
  });

  it('hides purchase controls during a pending operation or a provider-scheduled change', async () => {
    const pending = await load(
      context({
        pendingOperation: {
          operationId: 'b81a87f4-f765-4a40-9e84-bdca02f83c56',
          targetTier: 'professional_plus',
          status: 'requested',
          reason: 'reconciliation_pending',
        },
      }),
    );
    for (const action of Object.values(pending))
      expect(action).toMatchObject({ disabled: true, hidden: true });
    const scheduled = await load(
      context({
        scheduledChange: { targetTier: 'hobby', effectiveAt: '2026-10-01T00:00:00.000Z' },
        actions: context().actions.map((action) => ({
          ...action,
          action: 'blocked',
          reason: 'scheduled_change_pending',
        })),
      }),
    );
    for (const action of Object.values(scheduled))
      expect(action).toMatchObject({ disabled: true, hidden: true });
  });
});
