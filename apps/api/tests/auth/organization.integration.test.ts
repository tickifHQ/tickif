import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeOrganization } from '@repo/db/testing';
import { app } from '../../src/app.js';
import { createAuthedSession, createRoleSession } from '../helpers/auth.js';

describe('Better Auth organization lifecycle hardening', () => {
  it('requires authentication to list organization memberships', async () => {
    const response = await app.request('/api/auth/organization/list');

    expect(response.status).toBe(401);
  });

  it('lists only organizations where the authenticated user is a member', async () => {
    const { cookie, userId } = await createRoleSession('+919800005003', 'visitor');
    const memberOrganization = await makeOrganization({ slug: 'member-studio' });
    const unrelatedOrganization = await makeOrganization({ slug: 'unrelated-studio' });
    await db.insert(schema.member).values({
      id: `mem-member-studio-${userId}`,
      organizationId: memberOrganization.id,
      userId,
      role: 'member',
      createdAt: new Date(),
    });

    const response = await app.request('/api/auth/organization/list', {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    const organizations = (await response.json()) as Array<{ id: string }>;
    expect(organizations.map((organization) => organization.id)).toEqual([memberOrganization.id]);
    expect(organizations.some((organization) => organization.id === unrelatedOrganization.id)).toBe(
      false,
    );
  });

  it('prevents selecting an organization where the user is not a member', async () => {
    const { cookie } = await createAuthedSession('+919800005004');
    const organization = await makeOrganization({ slug: 'forbidden-active-studio' });

    const response = await app.request('/api/auth/organization/set-active', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.id }),
    });

    expect(response.status).toBe(403);
  });

  it('prevents clients from creating profile-less organizations outside onboarding', async () => {
    const { cookie } = await createAuthedSession('+919800005001');

    const response = await app.request('/api/auth/organization/create', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bypass Studio', slug: 'bypass-studio' }),
    });

    expect(response.status).toBe(403);
    const [organization] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, 'bypass-studio'));
    expect(organization).toBeUndefined();
  });

  it('prevents direct organization deletion outside an explicit product workflow', async () => {
    const { cookie } = await createAuthedSession('+919800005002');
    const organization = await makeOrganization({ slug: 'protected-studio' });

    const response = await app.request('/api/auth/organization/delete', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.id }),
    });

    expect(response.status).toBe(404);
    const [persisted] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, organization.id));
    expect(persisted?.id).toBe(organization.id);
  });
});
