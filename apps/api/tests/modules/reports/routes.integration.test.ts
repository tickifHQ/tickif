import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyticsResponseSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeLead, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

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
    const { cookie, designer } = await makeDesignerSession('+919800004002');
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const outsideWindow = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);
    const eventDay = (date: Date) => date.toISOString().slice(0, 10);

    const ownProject = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Published in window',
      createdAt: yesterday,
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
      status: 'new',
      receivedAt: today,
    });
    await makeLead({
      organizationId: designer.orgId,
      status: 'contacted',
      receivedAt: yesterday,
    });
    await makeLead({ status: 'new', receivedAt: today });

    await db.insert(schema.interactionEvent).values([
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
      total: 2,
      new: 1,
      contacted: 1,
      closed: 0,
      spam: 0,
    });
    expect(parsed.data.engagement).toEqual({ projectViews: 1, profileViews: 1 });
    expect(parsed.data.activity).toHaveLength(7);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.projectsCreated, 0)).toBe(1);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.leadsReceived, 0)).toBe(2);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.projectViews, 0)).toBe(1);
    expect(parsed.data.activity.reduce((sum, point) => sum + point.profileViews, 0)).toBe(1);
    expect(parsed.data.deferredMetrics).toEqual([]);
  });

  it('rejects authenticated designers without an active organization', async () => {
    const { cookie } = await createRoleSession('+919800004003', 'designer');

    const response = await app.request('/api/reports/analytics', {
      headers: { cookie },
    });

    expect(response.status).toBe(422);
  });
});

describe('POST /api/reports/projects/:id', () => {
  it('requires authentication', async () => {
    const response = await app.request(
      '/api/reports/projects/11111111-1111-4111-8111-111111111111',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'spam' }),
      },
    );

    expect(response.status).toBe(401);
  });

  it('records and idempotently updates a report for a published project', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const { cookie, userId } = await createRoleSession('+919800004011', 'visitor');

    const first = await app.request(`/api/reports/projects/${project.id}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    });
    const second = await app.request(`/api/reports/projects/${project.id}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: 'misleading',
        details: 'The project photos do not match the description.',
      }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ projectId: project.id, reported: true });
    const rows = await db
      .select()
      .from(schema.projectReport)
      .where(eq(schema.projectReport.reporterUserId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: project.id,
      reason: 'misleading',
      details: 'The project photos do not match the description.',
      status: 'open',
    });
  });
});
