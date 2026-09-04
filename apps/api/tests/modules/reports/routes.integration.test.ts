import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsResponseSchema, type RazorpayEvent } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeLead, makeOrganization, makeProject, makeTeam } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { processWebhookEvent } from '../../../src/modules/billing/webhook-service.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

afterEach(() => {
  vi.useRealTimers();
});

async function makeDesignerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId, status: 'active' });
  await db.insert(schema.member).values({
    id: `mem-reports-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return {
    cookie: await activateOrganization(cookie, designer.orgId),
    designer,
  };
}

describe('GET /api/reports/analytics', () => {
  it('rejects unauthenticated analytics requests', async () => {
    const response = await app.request('/api/reports/analytics');

    expect(response.status).toBe(401);
  });

  it('validates the requested analytics window', async () => {
    const { cookie } = await makeDesignerSession('+919800004001');

    const response = await app.request('/api/reports/analytics?days=6', {
      headers: { cookie },
    });

    expect(response.status).toBe(422);
  });

  it('returns real metrics scoped to the active designer organization', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-20T06:30:00.000Z'));
    const { cookie, designer } = await makeDesignerSession('+919800004002');
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const projectCreatedAt = new Date(yesterday);
    projectCreatedAt.setUTCHours(20, 0, 0, 0);
    const projectCreatedDayInIst = new Date(projectCreatedAt.getTime() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const previousPeriod = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);
    const outsideWindow = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);
    const eventDay = (date: Date) => date.toISOString().slice(0, 10);

    const ownProject = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Published in window',
      createdAt: projectCreatedAt,
    });
    await makeProject({
      designerId: designer.id,
      status: 'draft',
      title: 'Older draft',
      createdAt: outsideWindow,
    });
    const otherDesigner = await makeDesigner({ status: 'active' });
    const otherProject = await makeProject({
      designerId: otherDesigner.id,
      title: 'Other organization project',
      status: 'published',
    });

    await makeLead({
      organizationId: designer.orgId,
      referredProjectId: ownProject.id,
      source: 'enquiry',
      status: 'new',
      receivedAt: today,
    });
    await makeLead({
      organizationId: designer.orgId,
      referredProjectId: ownProject.id,
      source: 'enquiry',
      status: 'contacted',
      receivedAt: yesterday,
    });
    await makeLead({ status: 'new', receivedAt: today });
    await makeLead({
      organizationId: designer.orgId,
      referredProjectId: ownProject.id,
      source: 'consultation',
      status: 'spam',
      receivedAt: today,
    });
    await makeLead({
      organizationId: designer.orgId,
      referredProjectId: ownProject.id,
      source: 'enquiry',
      status: 'contacted',
      receivedAt: previousPeriod,
    });

    await db.insert(schema.interactionEvent).values([
      {
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: ownProject.id,
        designerProfileId: null,
        eventDay: eventDay(previousPeriod),
        createdAt: previousPeriod,
      },
      {
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: ownProject.id,
        designerProfileId: null,
        eventDay: eventDay(today),
        createdAt: today,
      },
      {
        type: 'profile_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: null,
        designerProfileId: otherDesigner.id,
        eventDay: eventDay(today),
        createdAt: today,
      },
      {
        type: 'profile_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: null,
        designerProfileId: designer.id,
        eventDay: eventDay(yesterday),
        createdAt: yesterday,
      },
      {
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: otherProject.id,
        designerProfileId: null,
        eventDay: eventDay(today),
        createdAt: today,
      },
      {
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: ownProject.id,
        designerProfileId: null,
        eventDay: eventDay(outsideWindow),
        createdAt: outsideWindow,
      },
    ]);

    const response = await app.request('/api/reports/analytics?days=7', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.safeParse(await response.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.projects).toEqual({
      total: 2,
      draft: 1,
      submitted: 0,
      inReview: 0,
      published: 1,
      rejected: 0,
      changesRequested: 0,
    });
    expect(parsed.data.leads).toEqual({
      total: 3,
      new: 1,
      contacted: 1,
      closed: 0,
      spam: 1,
    });
    expect(parsed.data.engagement).toEqual({ projectViews: 1, profileViews: 1 });
    expect(parsed.data.previousPeriod).toEqual({
      projectViews: 1,
      enquiries: 1,
      viewToEnquiryRate: 100,
      responseRate: 100,
    });
    expect(parsed.data.activity).toHaveLength(7);
    expect(
      parsed.data.activity.find((point) => point.date === projectCreatedDayInIst)?.projectsCreated,
    ).toBe(1);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.projectsCreated, 0)).toBe(1);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.leadsReceived, 0)).toBe(3);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.projectViews, 0)).toBe(1);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.profileViews, 0)).toBe(1);
    expect(parsed.data.topConvertingProjects).toEqual([
      expect.objectContaining({
        projectId: ownProject.id,
        views: 1,
        enquiries: 3,
        conversions: 1,
      }),
    ]);
    expect(parsed.data.acquisitionSources).toEqual([
      { source: 'enquiry', enquiries: 2, conversions: 1 },
      { source: 'consultation', enquiries: 1, conversions: 0 },
    ]);
    expect(parsed.data.deferredMetrics).toEqual([]);
  });

  it('rejects authenticated designers without an active organization', async () => {
    const { cookie } = await createRoleSession('+919800004003', 'designer');

    const response = await app.request('/api/reports/analytics', {
      headers: { cookie },
    });

    expect(response.status).toBe(422);
  });

  it.each([
    ['owner', 'full'],
    ['admin', 'full'],
    ['billing_admin', 'billing'],
    ['member', 'own'],
    ['viewer', 'organization'],
  ] as const)('enforces the %s analytics dataset on the route', async (role, expectedScope) => {
    const owner = await makeDesignerSession(
      `+9198000050${role.length.toString().padStart(2, '0')}`,
    );
    const [subscription] = await db
      .insert(schema.subscription)
      .values({ organizationId: owner.designer.orgId, planTier: 'corporate' })
      .returning();

    let cookie = owner.cookie;
    let responsibleMemberId: string | null = null;
    if (role !== 'owner') {
      const caller = await createRoleSession(
        `+9198000060${role.length.toString().padStart(2, '0')}`,
        'designer',
      );
      responsibleMemberId = `member-${role}`;
      await db.insert(schema.member).values({
        id: responsibleMemberId,
        organizationId: owner.designer.orgId,
        userId: caller.userId,
        role,
        createdAt: new Date(),
      });
      await db.insert(schema.teamMember).values({
        id: `team-member-${role}`,
        teamId: owner.designer.teamId,
        userId: caller.userId,
      });
      cookie = await activateOrganization(caller.cookie, owner.designer.orgId);
    }

    const project = await makeProject({
      designerId: owner.designer.id,
      responsibleMemberId: role === 'member' ? responsibleMemberId : null,
    });
    if (role === 'member') {
      await makeProject({ designerId: owner.designer.id, title: 'Unassigned project' });
      const now = new Date();
      await db.insert(schema.interactionEvent).values({
        type: 'profile_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        designerProfileId: owner.designer.id,
        eventDay: now.toISOString().slice(0, 10),
        createdAt: now,
      });
    }
    if (role === 'billing_admin') {
      await db.insert(schema.paymentTransaction).values([
        {
          subscriptionId: subscription!.id,
          razorpayPaymentId: `pay-${role}-inr`,
          amount: 299900,
          currency: 'INR',
          status: 'captured',
          payload: {},
        },
        {
          subscriptionId: subscription!.id,
          razorpayPaymentId: `pay-${role}-usd`,
          amount: 1000,
          currency: 'USD',
          status: 'captured',
          payload: {},
        },
      ]);
    }

    const response = await app.request('/api/reports/analytics?days=7', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed.access).toMatchObject({ role, roleScope: expectedScope });
    if (role === 'billing_admin') {
      expect(parsed.billing?.currencies).toEqual([
        expect.objectContaining({ currency: 'INR', capturedAmount: 299900 }),
        expect.objectContaining({ currency: 'USD', capturedAmount: 1000 }),
      ]);
      expect(parsed.projects.total).toBe(0);
    } else {
      expect(parsed.billing).toBeNull();
      expect(parsed.projects.total).toBe(1);
      if (role === 'member') expect(parsed.engagement.profileViews).toBe(0);
    }
    expect(project.id).toBeTruthy();
  });

  it('returns billing analytics when the organization has no designer profile', async () => {
    const caller = await createRoleSession('+919800004025', 'designer');
    const organization = await makeOrganization({ slug: `billing-only-${randomUUID()}` });
    await db.insert(schema.member).values({
      id: `member-billing-only-${randomUUID()}`,
      organizationId: organization.id,
      userId: caller.userId,
      role: 'billing_admin',
      createdAt: new Date(),
    });
    const [subscription] = await db
      .insert(schema.subscription)
      .values({ organizationId: organization.id, planTier: 'corporate' })
      .returning();
    await db.insert(schema.paymentTransaction).values({
      subscriptionId: subscription!.id,
      razorpayPaymentId: `pay-billing-only-${randomUUID()}`,
      amount: 499900,
      currency: 'INR',
      status: 'captured',
      payload: {},
    });
    const cookie = await activateOrganization(caller.cookie, organization.id);

    const response = await app.request('/api/reports/analytics?days=7', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed.dataset).toBe('billing');
    expect(parsed.billing?.currencies).toEqual([
      expect.objectContaining({ currency: 'INR', capturedAmount: 499900 }),
    ]);
    expect(parsed.projects.total).toBe(0);
    expect(parsed.engagement).toEqual({ projectViews: 0, profileViews: 0 });
    expect(
      await db
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.orgId, organization.id)),
    ).toEqual([]);
  });

  it('lets an owner select billing totals without changing the default engagement view', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004027');
    const [subscription] = await db
      .insert(schema.subscription)
      .values({ organizationId: designer.orgId, planTier: 'corporate' })
      .returning();
    await db.insert(schema.paymentTransaction).values({
      subscriptionId: subscription!.id,
      razorpayPaymentId: `pay-owner-${randomUUID()}`,
      amount: 799900,
      currency: 'INR',
      status: 'captured',
      payload: {},
    });

    const response = await app.request('/api/reports/analytics?days=7&dataset=billing', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed).toMatchObject({
      dataset: 'billing',
      access: { role: 'owner', roleScope: 'full', engagementVisible: true },
      billing: { currencies: [{ currency: 'INR', capturedAmount: 799900 }] },
    });
  });

  it('attributes a delayed failed webhook to the provider payment time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-20T06:30:00.000Z'));
    const caller = await createRoleSession('+919800004028', 'designer');
    const organization = await makeOrganization({ slug: `billing-delayed-${randomUUID()}` });
    await db.insert(schema.member).values({
      id: `member-billing-delayed-${randomUUID()}`,
      organizationId: organization.id,
      userId: caller.userId,
      role: 'billing_admin',
      createdAt: new Date(),
    });
    const razorpaySubscriptionId = `sub-delayed-${randomUUID()}`;
    const [subscription] = await db
      .insert(schema.subscription)
      .values({
        organizationId: organization.id,
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId,
      })
      .returning();
    const paymentId = `pay-delayed-${randomUUID()}`;
    const occurredAt = new Date('2026-08-01T08:00:00.000Z');
    const result = await processWebhookEvent('payment.failed' as RazorpayEvent, {
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: razorpaySubscriptionId, status: 'halted' } },
        payment: {
          entity: {
            id: paymentId,
            subscription_id: razorpaySubscriptionId,
            amount: 799900,
            currency: 'INR',
            status: 'failed',
            created_at: Math.floor(occurredAt.getTime() / 1000),
          },
        },
      },
    });
    expect(result.outcome).toBe('processed');

    const cookie = await activateOrganization(caller.cookie, organization.id);
    const response = await app.request('/api/reports/analytics?days=7', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed.billing?.currencies).toEqual([]);
    const [payment] = await db
      .select()
      .from(schema.paymentTransaction)
      .where(eq(schema.paymentTransaction.razorpayPaymentId, paymentId));
    expect(payment).toMatchObject({ subscriptionId: subscription!.id, occurredAt });
  });

  it('reports each distinct failed payment received through the webhook exactly once', async () => {
    const caller = await createRoleSession('+919800004026', 'designer');
    const organization = await makeOrganization({ slug: `billing-failed-${randomUUID()}` });
    await db.insert(schema.member).values({
      id: `member-billing-failed-${randomUUID()}`,
      organizationId: organization.id,
      userId: caller.userId,
      role: 'billing_admin',
      createdAt: new Date(),
    });
    const razorpaySubscriptionId = `sub-failed-${randomUUID()}`;
    const [subscription] = await db
      .insert(schema.subscription)
      .values({
        organizationId: organization.id,
        planTier: 'corporate',
        subscriptionState: 'active',
        razorpaySubscriptionId,
        razorpayStatus: 'active',
      })
      .returning();
    const paymentId = `pay-failed-${randomUUID()}`;
    const payload = {
      event: 'payment.failed',
      payload: {
        subscription: { entity: { id: razorpaySubscriptionId, status: 'halted' } },
        payment: {
          entity: {
            id: paymentId,
            subscription_id: razorpaySubscriptionId,
            amount: 799900,
            currency: 'INR',
            status: 'failed',
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
    };

    const first = await processWebhookEvent('payment.failed' as RazorpayEvent, payload);
    const replay = await processWebhookEvent('payment.failed' as RazorpayEvent, payload);
    const distinctRetry = await processWebhookEvent('payment.failed' as RazorpayEvent, {
      ...payload,
      payload: {
        ...payload.payload,
        payment: {
          entity: {
            ...payload.payload.payment.entity,
            id: `pay-failed-retry-${randomUUID()}`,
          },
        },
      },
    });
    expect(first.outcome).toBe('processed');
    expect(replay.outcome).toBe('duplicate');
    expect(distinctRetry.outcome).toBe('invalid_transition');

    const cookie = await activateOrganization(caller.cookie, organization.id);
    const response = await app.request('/api/reports/analytics?days=7', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed.billing?.currencies).toEqual([
      expect.objectContaining({
        currency: 'INR',
        failedAmount: 1599800,
        failedTransactions: 2,
      }),
    ]);
    expect(
      await db
        .select({ id: schema.paymentTransaction.id })
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.subscriptionId, subscription!.id)),
    ).toHaveLength(2);
  });

  it('excludes frozen branches without deleting their analytics history', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004020');
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'corporate',
    });
    const frozenTeamId = `team-frozen-${randomUUID()}`;
    await db.insert(schema.team).values({
      id: frozenTeamId,
      name: 'Frozen branch',
      organizationId: designer.orgId,
      frozen: true,
      frozenAt: new Date(),
      freezeRank: 1,
    });
    const frozenProfile = await makeDesigner({
      orgId: designer.orgId,
      teamId: frozenTeamId,
      displayName: 'Frozen branch',
    });
    await makeProject({ designerId: designer.id, title: 'Active branch project' });
    await makeProject({ designerId: frozenProfile.id, title: 'Frozen branch project' });

    const frozenResponse = analyticsResponseSchema.parse(
      await (await app.request('/api/reports/analytics?days=7', { headers: { cookie } })).json(),
    );
    expect(frozenResponse.projects.total).toBe(1);
    expect(frozenResponse.branches.map(({ branchId }) => branchId)).not.toContain(frozenTeamId);
    expect(frozenResponse.frozenBranches).toEqual([
      expect.objectContaining({ branchId: frozenTeamId, name: 'Frozen branch', freezeRank: 1 }),
    ]);

    await db
      .update(schema.team)
      .set({ frozen: false, frozenAt: null, freezeRank: null })
      .where(eq(schema.team.id, frozenTeamId));
    const restoredResponse = analyticsResponseSchema.parse(
      await (await app.request('/api/reports/analytics?days=7', { headers: { cookie } })).json(),
    );
    expect(restoredResponse.projects.total).toBe(2);
    expect(restoredResponse.branches.map(({ branchId }) => branchId)).toContain(frozenTeamId);
    expect(restoredResponse.frozenBranches).toEqual([]);
  });

  it('isolates every metric to the requested active Corporate branch', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004021');
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'corporate',
    });
    const secondTeam = await makeTeam({ organizationId: designer.orgId, name: 'Pune branch' });
    const secondProfile = await makeDesigner({
      orgId: designer.orgId,
      teamId: secondTeam.id,
      displayName: 'Pune branch',
    });
    await makeProject({ designerId: designer.id, title: 'Mumbai one' });
    await makeProject({ designerId: designer.id, title: 'Mumbai two' });
    const puneProject = await makeProject({ designerId: secondProfile.id, title: 'Pune only' });
    const now = new Date();
    await makeLead({
      organizationId: designer.orgId,
      teamId: secondProfile.teamId,
      referredProjectId: puneProject.id,
      receivedAt: now,
    });

    const response = await app.request(
      `/api/reports/analytics?days=7&branchId=${secondProfile.teamId}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(200);
    const parsed = analyticsResponseSchema.parse(await response.json());
    expect(parsed.access).toMatchObject({ level: 'branch', branchId: secondProfile.teamId });
    expect(parsed.projects.total).toBe(1);
    expect(parsed.leads.total).toBe(1);
    expect(parsed.branches).toEqual([]);
  });

  it('returns 402 when a lower-tier organization requests branch analytics', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004022');

    const response = await app.request(
      `/api/reports/analytics?days=7&branchId=${designer.teamId}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(402);
  });

  it('returns 404 for missing, frozen, and cross-organization branch ids', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004023');
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'corporate',
    });
    const frozenTeamId = `frozen-${randomUUID()}`;
    await db.insert(schema.team).values({
      id: frozenTeamId,
      name: 'Frozen',
      organizationId: designer.orgId,
      frozen: true,
      frozenAt: new Date(),
      freezeRank: 1,
    });
    await makeDesigner({ orgId: designer.orgId, teamId: frozenTeamId });
    const crossOrg = await makeDesigner();

    for (const branchId of [`missing-${randomUUID()}`, frozenTeamId, crossOrg.teamId]) {
      const response = await app.request(`/api/reports/analytics?days=7&branchId=${branchId}`, {
        headers: { cookie },
      });
      expect(response.status).toBe(404);
    }
  });

  it('denies a branch analytics request while the organization is locked', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800004024');
    const graceStartedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await db.insert(schema.subscription).values({
      organizationId: designer.orgId,
      planTier: 'corporate',
      subscriptionState: 'locked',
      preLapseTier: 'corporate',
      graceStartedAt,
      lockedAt: new Date(graceStartedAt.getTime() + 24 * 60 * 60 * 1000),
    });

    const response = await app.request(
      `/api/reports/analytics?days=7&branchId=${designer.teamId}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(403);
  });
});
