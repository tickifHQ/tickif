import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  billingChangePreviewSchema,
  billingSelectionContextSchema,
  billingSubscribeOutcomeSchema,
  type PlanTier,
} from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { createBillingOwner, providerMutationCount } from '../lib/billing';
import { apiUrl, providerUrl, webUrl } from '../lib/environment';

const headers = { origin: webUrl };

async function preview(context: BrowserContext, targetTier: PlanTier) {
  const response = await context.request.post(`${apiUrl}/api/billing/change-preview`, {
    headers,
    data: { targetTier },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return billingChangePreviewSchema.parse(await response.json());
}

async function selection(context: BrowserContext) {
  const response = await context.request.get(`${apiUrl}/api/billing/selection-context`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return billingSelectionContextSchema.parse(await response.json());
}

async function checkout(context: BrowserContext, targetTier: 'professional_plus' | 'corporate') {
  const review = await preview(context, targetTier);
  const response = await context.request.post(`${apiUrl}/api/billing/subscribe`, {
    headers,
    data: { targetTier, previewToken: review.previewToken, operationId: randomUUID() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return billingSubscribeOutcomeSchema.parse(await response.json());
}

async function rejectPurchase(
  context: BrowserContext,
  targetTier: 'professional_plus' | 'corporate',
  reason: string,
) {
  const review = await preview(context, targetTier);
  expect(review).toMatchObject({ action: 'blocked', confirmationAllowed: false, reason });
  const response = await context.request.post(`${apiUrl}/api/billing/subscribe`, {
    headers,
    data: { targetTier, previewToken: review.previewToken, operationId: randomUUID() },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: 'billing_action_unavailable' } });
}

async function fault(
  context: BrowserContext,
  input: {
    method: 'GET' | 'POST';
    path: string;
    mode: 'unavailable' | 'drop_after_accept';
    organizationId?: string;
  },
) {
  const response = await context.request.post(`${providerUrl}/billing-fixture/faults`, {
    data: input,
  });
  expect(response.ok()).toBeTruthy();
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string')
    throw new Error('Missing fixture fault ID');
  const id = value.id;
  return () => context.request.delete(`${providerUrl}/billing-fixture/faults/${id}`);
}

test('provider outage blocks a paid change preview without mutating billing', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'professional_plus');
  const clear = await fault(context, {
    method: 'GET',
    path: `/subscriptions/${owner.provider.id}`,
    mode: 'unavailable',
  });
  try {
    const result = await preview(context, 'corporate');
    expect(result).toMatchObject({
      action: 'blocked',
      reason: 'provider_unavailable',
      confirmationAllowed: false,
    });
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}`)).toBe(0);
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`)).toBe(
      0,
    );
    expect((await owner.subscription())?.planTier).toBe('professional_plus');
    // The one-shot outage clears, so an explicit new review can expose recovery.
    expect((await preview(context, 'corporate')).action).toBe('recover');
  } finally {
    await clear();
    await owner.dispose();
  }
});

test('lost checkout creation response remains uncertain across reload and cannot create twice', async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await createBillingOwner(context);
  const review = await preview(context, 'corporate');
  const input = {
    targetTier: 'corporate',
    previewToken: review.previewToken,
    operationId: randomUUID(),
  };
  const before = await providerMutationCount(context, '/subscriptions');
  const clear = await fault(context, {
    method: 'POST',
    path: '/subscriptions',
    mode: 'drop_after_accept',
    organizationId: owner.org.id,
  });
  try {
    const lost = await context.request.post(`${apiUrl}/api/billing/subscribe`, {
      headers,
      data: input,
    });
    expect(lost.status()).toBe(502);
    const state = await selection(context);
    expect(state.pendingOperation).toMatchObject({
      operationId: input.operationId,
      targetTier: 'corporate',
      status: 'reconciliation_pending',
    });
    expect(state.actions.every((action) => action.action === 'blocked')).toBeTruthy();
    for (const operationId of [input.operationId, randomUUID()]) {
      const retry = await context.request.post(`${apiUrl}/api/billing/subscribe`, {
        headers,
        data: { ...input, operationId },
      });
      expect(retry.status()).toBe(409);
      expect(await retry.json()).toMatchObject({ error: { code: 'reconciliation_pending' } });
    }
    await page.goto('/designer/plan-billing');
    await page.reload();
    expect((await selection(context)).pendingOperation?.operationId).toBe(input.operationId);
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
    expect((await owner.subscription())?.planTier ?? 'hobby').toBe('hobby');
    const operations = await db
      .select()
      .from(schema.billingOperation)
      .where(eq(schema.billingOperation.organizationId, owner.org.id));
    expect(operations).toHaveLength(1);
  } finally {
    await clear();
    await owner.dispose();
  }
});

test('lost cancellation response reconciles from live provider state without a second cancellation', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'corporate');
  const review = await preview(context, 'hobby');
  const input = {
    targetTier: 'hobby',
    previewToken: review.previewToken,
    operationId: randomUUID(),
  };
  const path = `/subscriptions/${owner.provider.id}/cancel`;
  const clear = await fault(context, { method: 'POST', path, mode: 'drop_after_accept' });
  try {
    const lost = await context.request.post(`${apiUrl}/api/billing/cancel`, {
      headers,
      data: input,
    });
    expect(lost.status()).toBe(502);
    expect((await selection(context)).pendingOperation).toBeNull();
    const retry = await context.request.post(`${apiUrl}/api/billing/cancel`, {
      headers,
      data: input,
    });
    expect(retry.ok(), await retry.text()).toBeTruthy();
    expect(await retry.json()).toMatchObject({ outcome: 'scheduled', alreadyCancelled: true });
    expect(await providerMutationCount(context, path)).toBe(1);
    expect((await owner.subscription())?.planTier).toBe('corporate');
  } finally {
    await clear();
    await owner.dispose();
  }
});

test('invalid duplicate and stale signed webhooks cannot grant or roll back a paid tier', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'professional_plus');
  const send = async (event: string, entity: Record<string, unknown>, valid = true) => {
    const body = JSON.stringify({ event, payload: { subscription: { entity } } });
    return context.request.post(`${apiUrl}/api/billing/webhook`, {
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': valid
          ? createHmac('sha256', 'tickif-e2e-webhook').update(body).digest('hex')
          : 'invalid-signature',
      },
      data: body,
    });
  };
  try {
    const corporate = { ...owner.provider, plan_id: 'plan_e2e_corporate' };
    expect((await send('subscription.activated', corporate, false)).status()).toBe(401);
    expect((await owner.subscription())?.planTier).toBe('professional_plus');
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
          data: corporate,
        })
      ).ok(),
    ).toBeTruthy();
    const update = await send('subscription.updated', corporate);
    expect(await update.json()).toMatchObject({ status: 'processed' });
    expect((await owner.subscription())?.planTier).toBe('corporate');
    expect(await (await send('subscription.updated', corporate)).json()).toMatchObject({
      status: 'duplicate',
    });
    // Replay old payload WITHOUT changing the provider fixture's current plan.
    expect((await send('subscription.activated', owner.provider)).ok()).toBeTruthy();
    expect((await send('subscription.updated', owner.provider)).ok()).toBeTruthy();
    expect((await owner.subscription())?.planTier).toBe('corporate');
    const local = await owner.subscription();
    const payments = await db
      .select()
      .from(schema.paymentTransaction)
      .where(eq(schema.paymentTransaction.subscriptionId, local!.id));
    expect(payments).toHaveLength(0);
  } finally {
    await owner.dispose();
  }
});

test('lost recovery cancellation retains the accepted target and reconciles without cancelling twice', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'corporate');
  const review = await preview(context, 'professional_plus');
  const input = {
    targetTier: 'professional_plus',
    previewToken: review.previewToken,
    operationId: randomUUID(),
    expectedRevision: null,
  };
  const path = `/subscriptions/${owner.provider.id}/cancel`;
  const clear = await fault(context, { method: 'POST', path, mode: 'drop_after_accept' });
  try {
    const lost = await context.request.post(`${apiUrl}/api/billing/recovery`, {
      headers,
      data: input,
    });
    expect(lost.status()).toBe(502);
    const [saved] = await db
      .select()
      .from(schema.billingRecovery)
      .where(eq(schema.billingRecovery.organizationId, owner.org.id));
    expect(saved).toMatchObject({
      targetTier: 'professional_plus',
      status: 'requested',
      reason: 'provider_outcome_unconfirmed',
    });
    const state = await selection(context);
    expect(state.recovery).toMatchObject({
      targetTier: 'professional_plus',
      status: 'waiting_for_expiry',
      sourceSubscriptionId: owner.provider.id,
    });
    expect(state.recovery?.eligibleAt).toBe(
      new Date(owner.provider.current_end * 1000).toISOString(),
    );
    const retry = await context.request.post(`${apiUrl}/api/billing/recovery`, {
      headers,
      data: input,
    });
    expect(retry.ok(), await retry.text()).toBeTruthy();
    expect(await retry.json()).toMatchObject({
      recovery: { targetTier: 'professional_plus', status: 'waiting_for_expiry' },
    });
    expect(await providerMutationCount(context, path)).toBe(1);
    expect((await owner.subscription())?.planTier).toBe('corporate');
  } finally {
    await clear();
    await owner.dispose();
  }
});

test('unfinished checkout rejects another tier and resumes the same provider subscription', async ({
  context,
}) => {
  const owner = await createBillingOwner(context);
  const before = await providerMutationCount(context, '/subscriptions');
  try {
    const initial = await checkout(context, 'corporate');
    const state = await selection(context);
    expect(state.unfinishedCheckout).toMatchObject({
      targetTier: 'corporate',
      status: 'created',
      razorpaySubscriptionId: initial.razorpaySubscriptionId,
    });
    await rejectPurchase(context, 'professional_plus', 'unfinished_checkout_conflict');
    const resumed = await checkout(context, 'corporate');
    expect(resumed.razorpaySubscriptionId).toBe(initial.razorpaySubscriptionId);
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
    expect((await owner.subscription())?.planTier).toBe('hobby');
    expect((await owner.subscription())?.razorpaySubscriptionId).toBe(
      initial.razorpaySubscriptionId,
    );
  } finally {
    await owner.dispose();
  }
});

test('authenticated checkout waits for activation and cannot create a second subscription', async ({
  context,
}) => {
  const owner = await createBillingOwner(context);
  const before = await providerMutationCount(context, '/subscriptions');
  try {
    const initial = await checkout(context, 'corporate');
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
          data: {
            ...owner.provider,
            id: initial.razorpaySubscriptionId,
            plan_id: 'plan_e2e_corporate',
            status: 'authenticated',
          },
        })
      ).ok(),
    ).toBeTruthy();
    const state = await selection(context);
    expect(state.unfinishedCheckout).toMatchObject({
      targetTier: 'corporate',
      status: 'authenticated',
      razorpaySubscriptionId: initial.razorpaySubscriptionId,
    });
    expect(
      state.actions.every(
        (action) => action.action === 'blocked' && action.reason === 'activation_pending',
      ),
    ).toBeTruthy();
    await rejectPurchase(context, 'corporate', 'activation_pending');
    await rejectPurchase(context, 'professional_plus', 'activation_pending');
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
    expect((await owner.subscription())?.planTier).toBe('hobby');
  } finally {
    await owner.dispose();
  }
});

for (const status of ['pending', 'halted'] as const) {
  test(`${status} mandate requires payment recovery and blocks a replacement purchase`, async ({
    context,
  }) => {
    const owner = await createBillingOwner(context, 'professional_plus');
    const before = await providerMutationCount(context, '/subscriptions');
    try {
      expect(
        (
          await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
            data: { ...owner.provider, status },
          })
        ).ok(),
      ).toBeTruthy();
      await rejectPurchase(context, 'corporate', 'payment_recovery_required');
      expect(await providerMutationCount(context, '/subscriptions')).toBe(before);
      expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}`)).toBe(0);
      expect(
        await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`),
      ).toBe(0);
      const local = await owner.subscription();
      expect(local?.planTier).toBe('professional_plus');
      expect(local?.razorpaySubscriptionId).toBe(owner.provider.id);
    } finally {
      await owner.dispose();
    }
  });
}

test('scheduled provider plan update retains current access and blocks conflicting selections', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'corporate');
  const before = await providerMutationCount(context, '/subscriptions');
  try {
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
          data: {
            ...owner.provider,
            has_scheduled_changes: true,
            change_scheduled_at: owner.provider.current_end,
            scheduled_plan_id: 'plan_e2e_professional',
          },
        })
      ).ok(),
    ).toBeTruthy();
    const state = await selection(context);
    expect(state.currentTier).toBe('corporate');
    expect(state.scheduledChange).toEqual({
      targetTier: 'professional_plus',
      effectiveAt: new Date(owner.provider.current_end * 1000).toISOString(),
    });
    expect(
      state.actions.every(
        (action) => action.action === 'blocked' && action.reason === 'scheduled_change_pending',
      ),
    ).toBeTruthy();
    await rejectPurchase(context, 'professional_plus', 'scheduled_change_pending');
    const hobby = await preview(context, 'hobby');
    expect(hobby).toMatchObject({ confirmationAllowed: false, reason: 'scheduled_change_pending' });
    const cancellation = await context.request.post(`${apiUrl}/api/billing/cancel`, {
      headers,
      data: { targetTier: 'hobby', previewToken: hobby.previewToken, operationId: randomUUID() },
    });
    expect(cancellation.status()).toBe(409);
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before);
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}`)).toBe(0);
    expect(await providerMutationCount(context, `/subscriptions/${owner.provider.id}/cancel`)).toBe(
      0,
    );
    expect((await owner.subscription())?.planTier).toBe('corporate');
  } finally {
    await owner.dispose();
  }
});
