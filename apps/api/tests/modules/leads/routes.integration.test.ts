import { describe, expect, it } from 'vitest';
import { testClient } from 'hono/testing';
import type { LeadDetailResponse, ListLeadsResponse } from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeLead,
  makeProject,
  makeTaxonomy,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

const client = testClient(app);

async function makeDesignerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { cookie, userId, designer };
}

async function requestJson(path: string, method: string, cookie: string | undefined, body: unknown) {
  return app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/leads', () => {
  it('rejects unauthenticated lead listing requests', async () => {
    const res = await client.api.leads.$get({ query: {} });
    expect(res.status).toBe(401);
  });

  it('returns an org-scoped lead page with filters, search, and pagination', async () => {
    const { cookie, userId, designer } = await makeDesignerSession('+919800003001');
    const project = await makeProject({
      designerId: designer.id,
      title: 'Bandra Apartment',
      citySlug: 'mumbai',
    });
    await makeLead({
      organizationId: designer.orgId,
      referredProjectId: project.id,
      name: 'Priya Shah',
      status: 'new',
      contactNumber: '+919800003101',
      budgetBandSlug: 'premium',
      receivedAt: new Date('2026-06-25T10:00:00.000Z'),
    });
    await makeLead({
      organizationId: designer.orgId,
      name: 'Rahul Mehta',
      status: 'contacted',
      contactNumber: '+919800003102',
      receivedAt: new Date('2026-06-26T10:00:00.000Z'),
    });
    await makeLead({ name: 'Other Org Lead', status: 'new' });
    await db.insert(schema.member).values({
      id: `mem-duplicate-${userId}`,
      organizationId: designer.orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });

    const res = await client.api.leads.$get(
      { query: { status: 'new', q: 'bandra', page: 1, limit: 1 } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ListLeadsResponse;
    expect(body).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(body.items[0]).toMatchObject({
      name: 'Priya Shah',
      city: 'mumbai',
      referredProjectTitle: 'Bandra Apartment',
      contactNumber: '+919800003101',
      budgetBand: 'premium',
      status: 'new',
    });

    const unfiltered = await client.api.leads.$get(
      { query: { status: 'all' } },
      { headers: { cookie } },
    );
    expect(unfiltered.status).toBe(200);
    const unfilteredBody = (await unfiltered.json()) as ListLeadsResponse;
    expect(unfilteredBody.total).toBe(2);
    expect(unfilteredBody.items.map((item) => item.name)).toEqual([
      'Rahul Mehta',
      'Priya Shah',
    ]);
  });
});

describe('POST /api/leads', () => {
  it('creates an internal lead for a caller organization', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800003002');
    const project = await makeProject({ designerId: designer.id, title: 'Powai Home' });
    await makeTaxonomy({ kind: 'budget_band', slug: 'premium', label: 'Premium' });

    const res = await requestJson('/api/leads', 'POST', cookie, {
      organizationId: designer.orgId,
      referredProjectId: project.id,
      name: 'Aditi Rao',
      contactNumber: '+919800003201',
      budgetBandSlug: 'premium',
      message: 'Need a design consultation',
      source: 'manual-seed',
      receivedAt: '2026-06-26T09:00:00.000Z',
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as LeadDetailResponse;
    expect(body).toMatchObject({
      name: 'Aditi Rao',
      referredProjectId: project.id,
      referredProjectTitle: 'Powai Home',
      budgetBand: 'premium',
      message: 'Need a design consultation',
      source: 'manual-seed',
      status: 'new',
      receivedAt: '2026-06-26T09:00:00.000Z',
    });
  });

  it('rejects invalid budget and cross-org project references', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800003003');
    const otherDesigner = await makeDesigner();
    const otherProject = await makeProject({ designerId: otherDesigner.id });

    const badBudget = await requestJson('/api/leads', 'POST', cookie, {
      organizationId: designer.orgId,
      name: 'Bad Budget',
      contactNumber: '+919800003301',
      budgetBandSlug: 'unknown',
    });
    expect(badBudget.status).toBe(422);

    const badProject = await requestJson('/api/leads', 'POST', cookie, {
      organizationId: designer.orgId,
      referredProjectId: otherProject.id,
      name: 'Bad Project',
      contactNumber: '+919800003302',
    });
    expect(badProject.status).toBe(422);
  });
});

describe('GET/PATCH /api/leads/:id', () => {
  it('reads and updates lead status for an organization member', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800003004');
    const lead = await makeLead({
      organizationId: designer.orgId,
      name: 'Status Lead',
      status: 'new',
    });

    const get = await app.request(`/api/leads/${lead.id}`, { headers: { cookie } });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ id: lead.id, status: 'new' });

    const update = await requestJson(`/api/leads/${lead.id}`, 'PATCH', cookie, {
      status: 'contacted',
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ id: lead.id, status: 'contacted' });
  });

  it('returns 403 for cross-org lead access and 422 for invalid status', async () => {
    const { cookie: ownerCookie, designer } = await makeDesignerSession('+919800003005');
    const stranger = await makeDesignerSession('+919800003006');
    const lead = await makeLead({ organizationId: designer.orgId });

    const crossOrg = await app.request(`/api/leads/${lead.id}`, {
      headers: { cookie: stranger.cookie },
    });
    expect(crossOrg.status).toBe(403);

    const invalidStatus = await requestJson(`/api/leads/${lead.id}`, 'PATCH', ownerCookie, {
      status: 'pending',
    });
    expect(invalidStatus.status).toBe(422);
  });

  it('returns 404 for missing lead reads and updates', async () => {
    const { cookie } = await makeDesignerSession('+919800003007');
    const missingId = '11111111-1111-4111-8111-111111111111';

    const get = await app.request(`/api/leads/${missingId}`, { headers: { cookie } });
    expect(get.status).toBe(404);

    const update = await requestJson(`/api/leads/${missingId}`, 'PATCH', cookie, {
      status: 'contacted',
    });
    expect(update.status).toBe(404);
  });
});
