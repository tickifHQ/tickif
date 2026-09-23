import { describe, expect, it } from 'vitest';
import type { AdminActivitySummary } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';
import { insertSearchActivity } from '../../../src/modules/search/repository.js';

describe('admin activity API', () => {
  it('serializes the last activity timestamp for users with recorded searches', async () => {
    const admin = await createRoleSession('+919800002303', 'admin');
    const createdAt = new Date('2026-09-22T12:00:00.000Z');
    await db.insert(schema.searchActivity).values({
      actorUserId: admin.userId,
      endpoint: 'projects',
      query: 'kitchen',
      createdAt,
    });

    const response = await app.request('/api/admin/activity/users?q=9800002303', {
      headers: { cookie: admin.cookie },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: admin.userId, searches: 1, lastActiveAt: createdAt.toISOString() }],
    });
  });

  it('treats backslashes and wildcard characters as literal user search text', async () => {
    const admin = await createRoleSession('+919800002304', 'admin');
    const target = await makeUser({ name: 'Studio \\_%' });
    await makeUser({ name: 'Studio \\A%' });

    const response = await app.request(
      `/api/admin/activity/users?q=${encodeURIComponent('Studio \\_%')}`,
      { headers: { cookie: admin.cookie } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ id: target.id }], total: 1 });
  });

  it('requires an admin platform role', async () => {
    const anonymous = await app.request('/api/admin/activity/summary');
    expect(anonymous.status).toBe(401);

    const designer = await createRoleSession('+919800002301', 'designer');
    const forbidden = await app.request('/api/admin/activity/summary', {
      headers: { cookie: designer.cookie },
    });
    expect(forbidden.status).toBe(403);
  });

  it('returns totals, filtered users, enquiries, and user history to admins', async () => {
    const admin = await createRoleSession('+919800002302', 'admin');
    const summaryResponse = await app.request('/api/admin/activity/summary', {
      headers: { cookie: admin.cookie },
    });
    expect(summaryResponse.status).toBe(200);
    expect((await summaryResponse.json()) as AdminActivitySummary).toEqual(
      expect.objectContaining({
        users: expect.any(Number),
        enquiries: expect.any(Number),
        searches: expect.any(Number),
      }),
    );

    const usersResponse = await app.request('/api/admin/activity/users?role=admin&q=9800002302', {
      headers: { cookie: admin.cookie },
    });
    expect(usersResponse.status).toBe(200);
    const users = (await usersResponse.json()) as { items: Array<{ id: string }> };
    expect(users.items).toEqual([expect.objectContaining({ id: admin.userId })]);

    await db.insert(schema.searchActivity).values({
      actorUserId: admin.userId,
      endpoint: 'projects',
      query: 'expired search',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    await insertSearchActivity({
      actorUserId: admin.userId,
      endpoint: 'projects',
      query: 'bedroom',
    });

    const [enquiriesResponse, activityResponse] = await Promise.all([
      app.request('/api/admin/activity/enquiries?status=open', {
        headers: { cookie: admin.cookie },
      }),
      app.request(`/api/admin/activity/users/${admin.userId}/activity`, {
        headers: { cookie: admin.cookie },
      }),
    ]);
    expect(enquiriesResponse.status).toBe(200);
    expect(activityResponse.status).toBe(200);
    expect(await activityResponse.json()).toEqual({
      searches: [expect.objectContaining({ endpoint: 'projects', query: 'bedroom' })],
      projectViews: [],
      profileViews: [],
    });
  });
});
