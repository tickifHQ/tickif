import { apiUrl, webUrl, providerUrl } from './environment';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { expect, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
import type { PlanTier } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from './auth';

export async function providerMutationCount(context: BrowserContext, path: string) {
  const response = await context.request.get(`${providerUrl}/billing-fixture/requests`);
  expect(response.ok()).toBeTruthy();
  const requests = z
    .array(z.object({ method: z.string(), path: z.string() }))
    .parse(await response.json());
  return requests.filter((request) => request.path === path && request.method !== 'GET').length;
}

export async function createBillingOwner(context: BrowserContext, tier: PlanTier = 'hobby') {
  await assertTestDb();
  const user = await makeUser({
    role: 'designer',
    status: 'active',
    phoneNumberVerified: true,
    phoneNumber: `+9196${randomInt(10_000_000, 99_999_999)}`,
  });
  const org = await makeOrganization({ name: `Billing regression ${randomUUID()}` });
  const providerId = `sub_e2e_${org.id}`;
  const currentStart = Math.floor(Date.now() / 1000) - 86400;
  const currentEnd = currentStart + 30 * 86400;
  const provider = {
    id: providerId,
    plan_id: tier === 'corporate' ? 'plan_e2e_corporate' : 'plan_e2e_professional',
    status: 'active',
    current_start: currentStart,
    current_end: currentEnd,
    notes: { organizationId: org.id, tier },
  };
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: org.id,
    userId: user.id,
    role: 'owner',
    createdAt: new Date(),
  });
  await makeDesigner({ orgId: org.id, userId: user.id, status: 'active' });
  if (tier !== 'hobby') {
    await db.insert(schema.subscription).values({
      organizationId: org.id,
      planTier: tier,
      subscriptionState: 'active',
      razorpayStatus: 'active',
      razorpaySubscriptionId: providerId,
      currentPeriodEnd: new Date(currentEnd * 1000),
    });
    expect(
      (
        await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
          data: provider,
        })
      ).ok(),
    ).toBeTruthy();
  }
  await signInPhone(context, user.phoneNumber);
  expect(
    (
      await context.request.put(`${apiUrl}/api/orgs/context`, {
        headers: { origin: webUrl },
        data: { kind: 'organization', organizationId: org.id },
      })
    ).ok(),
  ).toBeTruthy();
  return {
    org,
    user,
    provider,
    async subscription() {
      const [row] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org.id));
      return row;
    },
    async dispose() {
      await Promise.all(context.pages().map((page) => page.close()));
      await assertTestDb();
      await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
      await db.delete(schema.user).where(eq(schema.user.id, user.id));
    },
  };
}

/** Feed signed synthetic provider evidence through the real webhook and reconciliation. */
export async function deliverSubscriptionEvent(
  context: BrowserContext,
  event: 'subscription.activated' | 'subscription.updated' | 'subscription.cancelled',
  subscription: Record<string, unknown>,
) {
  expect(
    (
      await context.request.post(`${providerUrl}/billing-fixture/subscriptions`, {
        data: subscription,
      })
    ).ok(),
  ).toBeTruthy();
  const body = JSON.stringify({
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: { subscription: { entity: subscription } },
  });
  const response = await context.request.post(`${apiUrl}/api/billing/webhook`, {
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', 'tickif-e2e-webhook').update(body).digest('hex'),
    },
    data: body,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}
