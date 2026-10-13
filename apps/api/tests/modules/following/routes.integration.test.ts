import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeTaxonomy } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('following API', () => {
  it('serves only the actor’s followed public projects with scoped search, filters and pagination', async () => {
    expect((await app.request('/api/following/feed')).status).toBe(401);
    const visitor = await createRoleSession('+919800007006', 'visitor');
    const other = await createRoleSession('+919800007007', 'visitor');
    const admin = await createRoleSession('+919800007008', 'admin');
    const studio = await makeDesigner({ status: 'active' });
    const unfollowed = await makeDesigner({ status: 'active' });
    const inactive = await makeDesigner({ status: 'suspended' });
    await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
    await makeTaxonomy({ kind: 'city', slug: 'chennai', label: 'Chennai' });
    await db.insert(schema.designerFollow).values([
      { userId: visitor.userId, designerProfileId: studio.id },
      { userId: visitor.userId, designerProfileId: inactive.id },
      { userId: other.userId, designerProfileId: unfollowed.id },
    ]);
    const older = await makeProject({
      designerId: studio.id,
      title: 'Calm older',
      status: 'published',
      publishedAt: new Date(Date.now() - 20000),
      citySlug: 'mumbai',
    });
    const newer = await makeProject({
      designerId: studio.id,
      title: 'Calm newer',
      status: 'published',
      publishedAt: new Date(Date.now() - 10000),
      citySlug: 'chennai',
    });
    await makeProject({
      designerId: unfollowed.id,
      title: 'Calm unrelated',
      status: 'published',
      publishedAt: new Date(),
    });
    await makeProject({ designerId: inactive.id, status: 'published', publishedAt: new Date() });
    await makeProject({ designerId: studio.id, status: 'draft' });
    await makeProject({
      designerId: studio.id,
      status: 'published',
      publishedAt: new Date(Date.now() + 86400000),
    });
    const headers = { cookie: visitor.cookie };
    const first = await app.request('/api/following/feed?limit=1', { headers });
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(await first.json()).toMatchObject({
      items: [{ id: newer.id }],
      hasMore: true,
      source: 'db',
      fallback: 'none',
    });
    const last = await app.request('/api/following/feed?limit=1&page=2', { headers });
    expect(await last.json()).toMatchObject({ items: [{ id: older.id }], hasMore: false });
    const filtered = await app.request('/api/following/feed?q=Calm&citySlug=mumbai', { headers });
    expect(await filtered.json()).toMatchObject({
      items: [{ id: older.id }],
      hasMore: false,
      facetDistribution: { citySlug: { mumbai: 1 } },
    });
    const empty = await app.request('/api/following/feed?q=unrelated', { headers });
    expect(await empty.json()).toMatchObject({ items: [], fallback: 'none', relaxedFilters: [] });
    expect((await app.request('/api/following/feed?limit=49', { headers })).status).toBe(422);
    expect(
      (await app.request('/api/following/feed', { headers: { cookie: admin.cookie } })).status,
    ).toBe(403);
    await db.delete(schema.designerFollow).where(eq(schema.designerFollow.userId, visitor.userId));
    expect(await (await app.request('/api/following/feed', { headers })).json()).toMatchObject({
      items: [],
      hasMore: false,
    });
  });
  it('requires customer auth and validates identifiers', async () => {
    expect((await app.request('/api/following')).status).toBe(401);
    const visitor = await createRoleSession('+919800007001', 'visitor');
    expect(
      (
        await app.request('/api/following/not-an-id', {
          method: 'PUT',
          headers: { cookie: visitor.cookie },
        })
      ).status,
    ).toBe(422);
    const admin = await createRoleSession('+919800007002', 'admin');
    expect(
      (await app.request('/api/following', { headers: { cookie: admin.cookie } })).status,
    ).toBe(403);
  });
  it('persists idempotently, counts only newly published public projects, and keeps stale acknowledgements monotonic', async () => {
    const visitor = await createRoleSession('+919800007003', 'visitor');
    const other = await createRoleSession('+919800007004', 'visitor');
    const studio = await makeDesigner({ status: 'active' });
    const url = `/api/following/${studio.id}`;
    const headers = { cookie: visitor.cookie, 'content-type': 'application/json' };
    expect((await app.request(url, { method: 'PUT', headers })).status).toBe(200);
    const [initial] = await db
      .select()
      .from(schema.designerFollow)
      .where(eq(schema.designerFollow.userId, visitor.userId));
    await app.request(url, { method: 'PUT', headers });
    const [repeated] = await db
      .select()
      .from(schema.designerFollow)
      .where(eq(schema.designerFollow.userId, visitor.userId));
    expect(repeated?.followedAt).toEqual(initial?.followedAt);
    const yesterday = new Date(Date.now() - 86400000);
    await db
      .update(schema.designerFollow)
      .set({ lastSeenAt: yesterday })
      .where(eq(schema.designerFollow.userId, visitor.userId));
    await makeProject({ designerId: studio.id, publishedAt: new Date(), status: 'published' });
    await makeProject({ designerId: studio.id, publishedAt: new Date(), status: 'draft' });
    await makeProject({
      designerId: studio.id,
      publishedAt: new Date(Date.now() + 86400000),
      status: 'published',
    });
    const list = await app.request('/api/following', { headers });
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    expect(await list.json()).toMatchObject({ total: 1, items: [{ newProjectCount: 1 }] });
    expect(
      await (await app.request('/api/following', { headers: { cookie: other.cookie } })).json(),
    ).toMatchObject({ total: 0 });
    const seenThrough = new Date().toISOString();
    await app.request(`${url}/seen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ seenThrough }),
    });
    await app.request(`${url}/seen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ seenThrough: yesterday.toISOString() }),
    });
    expect(await (await app.request('/api/following', { headers })).json()).toMatchObject({
      items: [{ newProjectCount: 0 }],
    });
    await db
      .update(schema.designerProfile)
      .set({ status: 'suspended' })
      .where(eq(schema.designerProfile.id, studio.id));
    expect(await (await app.request('/api/following', { headers })).json()).toMatchObject({
      total: 0,
    });
    expect((await app.request(url, { method: 'PUT', headers })).status).toBe(404);
    await app.request(url, { method: 'DELETE', headers });
    expect(await db.select().from(schema.designerFollow)).toHaveLength(0);
  });
  it('does not allow a studio owner to follow their own studio', async () => {
    const owner = await createRoleSession('+919800007005', 'designer');
    const studio = await makeDesigner({ userId: owner.userId, status: 'active' });
    expect(
      (
        await app.request(`/api/following/${studio.id}`, {
          method: 'PUT',
          headers: { cookie: owner.cookie },
        })
      ).status,
    ).toBe(403);
  });
});
