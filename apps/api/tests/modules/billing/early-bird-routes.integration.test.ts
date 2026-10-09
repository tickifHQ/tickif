import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeOrganization } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

const post = (cookie: string, body: unknown) =>
  app.request('/api/billing/early-bird', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('early-bird authenticated claim', () => {
  it('requires authentication for status and claims', async () => {
    expect((await app.request('/api/billing/early-bird')).status).toBe(401);
    expect((await post('', { targetTier: 'corporate' })).status).toBe(401);
  });

  it('grants only the active organization, validates the tier, and prevents a removed owner from claiming', async () => {
    const org = await makeOrganization();
    const other = await makeOrganization();
    const session = await createRoleSession('+919800007710', 'designer');
    await db
      .insert(schema.member)
      .values({
        id: 'trial-owner-route',
        organizationId: org.id,
        userId: session.userId,
        role: 'owner',
        createdAt: new Date(),
      });
    const cookie = await activateOrganization(session.cookie, org.id);
    expect((await post(cookie, { targetTier: 'hobby' })).status).toBe(422);
    const status = await app.request('/api/billing/early-bird', { headers: { cookie } });
    expect(await status.json()).toEqual({ eligible: true, trial: null });
    const response = await post(cookie, {
      targetTier: 'corporate',
      organizationId: other.id,
      months: 12,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      eligible: false,
      trial: { tier: 'corporate', endsAt: '2027-01-09T06:00:00.000Z' },
    });
    const rows = await db.select().from(schema.subscription);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: org.id,
      planTier: 'corporate',
      razorpaySubscriptionId: null,
    });
    await db.delete(schema.member).where(eq(schema.member.id, 'trial-owner-route'));
    expect((await post(cookie, { targetTier: 'corporate' })).status).toBe(403);
  });

  it('does not grant billing access to an ordinary member', async () => {
    const org = await makeOrganization();
    const session = await createRoleSession('+919800007711', 'designer');
    await db
      .insert(schema.member)
      .values({
        id: 'trial-member-route',
        organizationId: org.id,
        userId: session.userId,
        role: 'member',
        createdAt: new Date(),
      });
    const cookie = await activateOrganization(session.cookie, org.id);
    expect((await post(cookie, { targetTier: 'professional_plus' })).status).toBe(403);
    expect(await db.select().from(schema.subscription)).toHaveLength(0);
  });
});
