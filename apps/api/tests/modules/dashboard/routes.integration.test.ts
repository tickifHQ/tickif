import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DashboardOverviewResponse, DashboardOverviewShareResponse } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { makeOrganization, makeProject, makeTaxonomy } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

async function request(method: string, path: string, cookie?: string) {
  return app.request(path, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

async function makeDashboardDesigner(phoneNumber = '+919800004001') {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const org = await makeOrganization({ name: 'Studio Noir', slug: 'studio-noir' });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: org.id,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  const [designer] = await db
    .insert(schema.designerProfile)
    .values({
      userId,
      orgId: org.id,
      displayName: 'Studio Noir',
      bio: 'Warm minimal interiors.',
      address: 'Indiranagar, Bangalore',
      projectCount: 1,
      status: 'active',
    })
    .returning();
  return { cookie, userId, org, designer: designer! };
}

describe('GET /api/dashboard/overview', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request('GET', '/api/dashboard/overview');
    expect(res.status).toBe(401);
  });

  it('returns the overview page aggregate for the active studio', async () => {
    const { cookie, designer } = await makeDashboardDesigner();
    await makeProject({
      designerId: designer.id,
      title: 'Maitri Apartments - 2BHK luxury in Bangalore',
      status: 'submitted',
      submittedAt: new Date('2026-06-20T10:00:00.000Z'),
    });
    const scope = await makeTaxonomy({ kind: 'scope', slug: 'construction', label: 'Construction' });
    await db.insert(schema.designerProfileFootprint).values({
      profileId: designer.id,
      taxonomyId: scope.id,
    });

    const res = await request('GET', '/api/dashboard/overview', cookie);

    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardOverviewResponse;
    expect(body.header.title).toBe('Welcome, Studio Noir');
    expect(body.studio).toMatchObject({
      profileId: designer.id,
      orgSlug: 'studio-noir',
      location: 'Indiranagar, Bangalore',
    });
    expect(body.projectReview).toMatchObject({
      status: 'pending_review',
      title: 'We review your project',
      sla: '24-48 hours',
    });
    expect(body.actions.map((action: { key: string }) => action.key)).toEqual([
      'project-review',
      'complete-profile',
    ]);
    expect(body.portfolio).toMatchObject({
      publicPath: '/d/studio-noir',
      copyText: 'tickif.in/d/studio-noir',
      shareCount: 0,
    });
    expect(JSON.stringify(body).toLowerCase()).not.toContain('kyc');
  });
});

describe('POST /api/dashboard/overview/share', () => {
  it('increments the profile share count for copy-link actions', async () => {
    const { cookie, designer } = await makeDashboardDesigner('+919800004002');

    const res = await request('POST', '/api/dashboard/overview/share', cookie);

    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardOverviewShareResponse;
    expect(body).toMatchObject({
      publicPath: '/d/studio-noir',
      copyText: 'tickif.in/d/studio-noir',
      shareCount: 1,
    });

    const [profile] = await db
      .select({ shareCount: schema.designerProfile.shareCount })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, designer.id));
    expect(profile!.shareCount).toBe(1);
  });
});
