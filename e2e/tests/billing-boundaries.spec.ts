import { apiUrl, webUrl, providerUrl, environment } from '../lib/environment';
import {
  createBillingOwner,
  deliverSubscriptionEvent,
  providerMutationCount,
} from '../lib/billing';
import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  billingChangePreviewSchema,
  billingRecoveryResponseSchema,
  billingSubscribeOutcomeSchema,
  type PlanTier,
} from '@repo/contracts';
import { and, db, eq, schema } from '@repo/db';
import { z } from 'zod';

const post = (context: BrowserContext, path: string, data: unknown) =>
  context.request.post(`${apiUrl}/api/billing${path}`, { headers: { origin: webUrl }, data });
async function preview(context: BrowserContext, targetTier: PlanTier) {
  const response = await post(context, '/change-preview', { targetTier });
  expect(response.ok(), await response.text()).toBeTruthy();
  return billingChangePreviewSchema.parse(await response.json());
}
async function recovery(context: BrowserContext) {
  const response = await context.request.get(`${apiUrl}/api/billing/recovery`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return billingRecoveryResponseSchema.parse(await response.json()).recovery;
}
function expiredFixtureToken(token: string) {
  // Use only the isolated E2E signing secret to exercise expiry validation
  // independently from signature rejection, without a five-minute sleep.
  const encoded = token.split('.')[0]!;
  const decoded = z
    .object({ expiresAt: z.string() })
    .passthrough()
    .parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
  const payload = Buffer.from(
    JSON.stringify({ ...decoded, expiresAt: '2000-01-01T00:00:00.000Z' }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', environment.BETTER_AUTH_SECRET).update(`billing-preview:${payload}`).digest('hex')}`;
}

test('preview authorization rejects tampering, expiry and a different target or organization before provider mutation', async ({
  context,
  browser,
}) => {
  const owner = await createBillingOwner(context);
  const otherContext = await browser.newContext();
  const other = await createBillingOwner(otherContext);
  try {
    const quote = await preview(context, 'corporate');
    const before = await providerMutationCount(context, '/subscriptions');
    const payload = {
      targetTier: 'corporate',
      operationId: randomUUID(),
      previewToken: quote.previewToken,
    };
    const tampered =
      quote.previewToken.slice(0, -1) + (quote.previewToken.endsWith('a') ? 'b' : 'a');
    for (const input of [
      { ...payload, operationId: randomUUID(), previewToken: tampered },
      {
        ...payload,
        operationId: randomUUID(),
        previewToken: expiredFixtureToken(quote.previewToken),
      },
      { ...payload, operationId: randomUUID(), targetTier: 'professional_plus' },
    ]) {
      const response = await post(context, '/subscribe', input);
      expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'preview_stale' } });
    }
    const crossOrg = await post(otherContext, '/subscribe', payload);
    expect(crossOrg.status()).toBe(409);
    expect(await crossOrg.json()).toMatchObject({ error: { code: 'preview_stale' } });
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before);
    expect(await owner.subscription()).toBeUndefined();
    expect(await other.subscription()).toBeUndefined();
  } finally {
    await owner.dispose();
    await other.dispose();
    await otherContext.close();
  }
});

test('simultaneous submissions and completed-operation replay create exactly one provider checkout', async ({
  context,
}) => {
  const owner = await createBillingOwner(context);
  try {
    const quote = await preview(context, 'corporate');
    const input = {
      targetTier: 'corporate',
      operationId: randomUUID(),
      previewToken: quote.previewToken,
    };
    const before = await providerMutationCount(context, '/subscriptions');
    const responses = await Promise.all([
      post(context, '/subscribe', input),
      post(context, '/subscribe', input),
    ]);
    expect(responses.some((response) => response.status() === 200)).toBe(true);
    for (const response of responses) {
      expect([200, 409]).toContain(response.status());
      if (response.status() === 409)
        expect(await response.json()).toMatchObject({ error: { code: 'reconciliation_pending' } });
    }
    const successful = responses.find((response) => response.status() === 200)!;
    const first = billingSubscribeOutcomeSchema.parse(await successful.json());
    const repeated = await post(context, '/subscribe', input);
    expect(repeated.status()).toBe(200);
    expect(billingSubscribeOutcomeSchema.parse(await repeated.json())).toEqual(first);
    const conflicting = await post(context, '/subscribe', {
      ...input,
      targetTier: 'professional_plus',
    });
    expect(conflicting.status()).toBe(409);
    expect(await conflicting.json()).toMatchObject({ error: { code: 'operation_conflict' } });
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before + 1);
    expect(await owner.subscription()).toMatchObject({
      planTier: 'hobby',
      razorpayStatus: 'created',
      razorpaySubscriptionId: first.razorpaySubscriptionId,
    });
    const operations = await db
      .select()
      .from(schema.billingOperation)
      .where(eq(schema.billingOperation.organizationId, owner.org.id));
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: input.operationId,
      status: 'scheduled',
      targetTier: 'corporate',
    });
  } finally {
    await owner.dispose();
  }
});

test('recovery revisions protect replacement and dismissal never reverses provider cancellation', async ({
  context,
}) => {
  const owner = await createBillingOwner(context, 'corporate');
  try {
    const quote = await preview(context, 'professional_plus');
    expect(quote.action).toBe('recover');
    const cancelPath = `/subscriptions/${owner.provider.id}/cancel`;
    const before = await providerMutationCount(context, cancelPath);
    const savedResponse = await post(context, '/recovery', {
      targetTier: 'professional_plus',
      expectedRevision: null,
      operationId: randomUUID(),
      previewToken: quote.previewToken,
    });
    expect(savedResponse.status()).toBe(200);
    const saved = billingRecoveryResponseSchema.parse(await savedResponse.json()).recovery!;
    expect(saved).toMatchObject({ targetTier: 'professional_plus', status: 'waiting_for_expiry' });
    expect(await providerMutationCount(context, cancelPath)).toBe(before + 1);
    const staleDismiss = await post(context, '/recovery/dismiss', {
      expectedRevision: saved.revision - 1,
    });
    expect(staleDismiss.status()).toBe(409);
    expect(await staleDismiss.json()).toMatchObject({
      error: { code: 'recovery_revision_conflict' },
    });
    expect(await owner.subscription()).toMatchObject({
      planTier: 'corporate',
      cancelAtPeriodEnd: true,
    });

    await deliverSubscriptionEvent(context, 'subscription.cancelled', {
      ...owner.provider,
      status: 'cancelled',
      ended_at: Math.floor(Date.now() / 1000),
    });
    const eligible = await recovery(context);
    expect(eligible?.status).toBe('eligible');
    const replacementPreview = await preview(context, 'corporate');
    const staleReplace = await post(context, '/recovery', {
      targetTier: 'corporate',
      expectedRevision: saved.revision,
      operationId: randomUUID(),
      previewToken: replacementPreview.previewToken,
    });
    expect(staleReplace.status()).toBe(409);
    expect(await staleReplace.json()).toMatchObject({
      error: { code: 'recovery_revision_conflict' },
    });
    const replacedResponse = await post(context, '/recovery', {
      targetTier: 'corporate',
      expectedRevision: eligible!.revision,
      operationId: randomUUID(),
      previewToken: replacementPreview.previewToken,
    });
    expect(replacedResponse.status(), await replacedResponse.text()).toBe(200);
    const replaced = billingRecoveryResponseSchema.parse(await replacedResponse.json()).recovery!;
    expect(replaced).toMatchObject({ targetTier: 'corporate', status: 'eligible' });
    const dismissed = await post(context, '/recovery/dismiss', {
      expectedRevision: replaced.revision,
    });
    expect(dismissed.status()).toBe(200);
    expect(billingRecoveryResponseSchema.parse(await dismissed.json()).recovery?.status).toBe(
      'dismissed',
    );
    expect(await recovery(context)).toBeNull();
    expect(await providerMutationCount(context, cancelPath)).toBe(before + 1);
    expect(await owner.subscription()).toMatchObject({
      planTier: 'hobby',
      razorpaySubscriptionId: null,
      razorpayStatus: null,
    });
    const ended = await context.request.get(
      `${providerUrl}/razorpay/v1/subscriptions/${owner.provider.id}`,
    );
    expect(ended.ok()).toBeTruthy();
    expect(await ended.json()).toMatchObject({ id: owner.provider.id, status: 'cancelled' });
  } finally {
    await owner.dispose();
  }
});

test('revoked billing permission blocks saved preview execution and billing reads', async ({
  context,
}) => {
  const owner = await createBillingOwner(context);
  try {
    const quote = await preview(context, 'corporate');
    const before = await providerMutationCount(context, '/subscriptions');
    await db
      .update(schema.member)
      .set({ role: 'member' })
      .where(
        and(
          eq(schema.member.organizationId, owner.org.id),
          eq(schema.member.userId, owner.user.id),
        ),
      );
    for (const path of ['/selection-context', '/recovery'])
      expect((await context.request.get(`${apiUrl}/api/billing${path}`)).status()).toBe(403);
    expect((await post(context, '/change-preview', { targetTier: 'corporate' })).status()).toBe(
      403,
    );
    const result = await post(context, '/subscribe', {
      targetTier: 'corporate',
      operationId: randomUUID(),
      previewToken: quote.previewToken,
    });
    expect(result.status()).toBe(403);
    expect(await providerMutationCount(context, '/subscriptions')).toBe(before);
    expect(await owner.subscription()).toBeUndefined();
  } finally {
    await owner.dispose();
  }
});
