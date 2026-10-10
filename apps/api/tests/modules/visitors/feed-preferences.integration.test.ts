import { describe, expect, it } from 'vitest';
import { PLATFORM_ROLE, visitorFeedPreferencesResponseSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

async function locations() {
  const [city] = await db
    .insert(schema.taxonomy)
    .values({ kind: 'city', slug: 'test-city', label: 'Test city' })
    .returning();
  const [other] = await db
    .insert(schema.taxonomy)
    .values({ kind: 'city', slug: 'other-city', label: 'Other city' })
    .returning();
  const [locality] = await db
    .insert(schema.taxonomy)
    .values({ kind: 'locality', slug: 'test-area', label: 'Test area', parentId: city!.id })
    .returning();
  return { city: city!, other: other!, locality: locality! };
}
function request(method: 'GET' | 'PUT', cookie?: string, body?: unknown) {
  return app.request('/api/visitors/me/feed-preferences', {
    method,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}
describe('visitor feed preference routes', () => {
  it('guards anonymous reads and writes', async () => {
    expect((await request('GET')).status).toBe(401);
    expect(
      (await request('PUT', undefined, { homeType: null, cityId: null, localityId: null })).status,
    ).toBe(401);
  });
  it('saves validated preferences, activates pending visitors and preserves contact data', async () => {
    const { city, locality } = await locations();
    const { cookie, userId } = await createRoleSession('+919800007001', PLATFORM_ROLE.VISITOR);
    await db
      .insert(schema.visitorProfile)
      .values({ userId, address: 'Existing address', whatsappNumber: '+919800007001' });
    const write = await request('PUT', cookie, {
      homeType: '3-bhk',
      cityId: city.id,
      localityId: locality.id,
    });
    expect(write.status).toBe(200);
    const result = visitorFeedPreferencesResponseSchema.parse(await write.json());
    expect(result).toMatchObject({
      homeType: '3-bhk',
      city: { slug: city.slug },
      locality: { slug: locality.slug },
      onboardingCompletedAt: expect.any(String),
    });
    expect(await (await request('GET', cookie)).json()).toEqual(result);
    const [profile] = await db
      .select()
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(profile).toMatchObject({ address: 'Existing address', whatsappNumber: '+919800007001' });
    const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(user?.status).toBe('active');
    const again = await request('PUT', cookie, {
      homeType: 'villa',
      cityId: city.id,
      localityId: null,
    });
    expect(
      visitorFeedPreferencesResponseSchema.parse(await again.json()).onboardingCompletedAt,
    ).toBe(result.onboardingCompletedAt);
  });
  it('records Skip with no preferences and no forced phone/name update', async () => {
    const { cookie, userId } = await createRoleSession('+919800007002', PLATFORM_ROLE.VISITOR);
    expect(
      visitorFeedPreferencesResponseSchema.parse(await (await request('GET', cookie)).json())
        .onboardingCompletedAt,
    ).toBeNull();
    const response = await request('PUT', cookie, {
      homeType: null,
      cityId: null,
      localityId: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      homeType: null,
      city: null,
      locality: null,
      onboardingCompletedAt: expect.any(String),
    });
    const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(user?.status).toBe('active');
  });
  it('rejects inactive, cross-city, wrong-kind and invalid locations atomically', async () => {
    const { city, other, locality } = await locations();
    const { cookie, userId } = await createRoleSession('+919800007003', PLATFORM_ROLE.VISITOR);
    for (const body of [
      { homeType: '3-bhk', cityId: other.id, localityId: locality.id },
      { homeType: '3-bhk', cityId: locality.id, localityId: null },
      { homeType: '3-bhk', cityId: '11111111-1111-4111-8111-111111111111', localityId: null },
      { homeType: 'castle', cityId: city.id, localityId: null },
      { homeType: 'villa', cityId: city.id, localityId: null, userId: 'someone-else' },
    ])
      expect((await request('PUT', cookie, body)).status).toBe(422);
    await db
      .update(schema.taxonomy)
      .set({ isActive: false })
      .where(eq(schema.taxonomy.id, city.id));
    expect(
      (await request('PUT', cookie, { homeType: '3-bhk', cityId: city.id, localityId: null }))
        .status,
    ).toBe(422);
    const [profile] = await db
      .select()
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(profile).toBeUndefined();
    const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(user?.status).toBe('pending');
  });
  it.each([PLATFORM_ROLE.DESIGNER, PLATFORM_ROLE.ADMIN, PLATFORM_ROLE.SUPERADMIN])(
    'rejects %s access',
    async (role) => {
      const { cookie } = await createRoleSession('+919800007004', role);
      expect((await request('GET', cookie)).status).toBe(403);
      expect(
        (await request('PUT', cookie, { homeType: null, cityId: null, localityId: null })).status,
      ).toBe(403);
    },
  );
  it('rejects banned and suspended visitors with fresh authorization', async () => {
    const { cookie, userId } = await createRoleSession('+919800007005', PLATFORM_ROLE.VISITOR);
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, userId));
    expect(
      (await request('PUT', cookie, { homeType: null, cityId: null, localityId: null })).status,
    ).toBe(403);
    await db
      .update(schema.user)
      .set({ banned: false, status: 'suspended' })
      .where(eq(schema.user.id, userId));
    expect((await request('GET', cookie)).status).toBe(403);
  });
  it('keeps preference reads isolated and degrades safely when location terms disappear', async () => {
    const { city, locality } = await locations();
    const first = await createRoleSession('+919800007006', PLATFORM_ROLE.VISITOR);
    const second = await createRoleSession('+919800007007', PLATFORM_ROLE.VISITOR);
    expect(
      (
        await request('PUT', first.cookie, {
          homeType: '2-bhk',
          cityId: city.id,
          localityId: locality.id,
        })
      ).status,
    ).toBe(200);
    expect(
      visitorFeedPreferencesResponseSchema.parse(
        await (await request('GET', second.cookie)).json(),
      ),
    ).toMatchObject({ homeType: null, city: null, locality: null });
    await db
      .update(schema.taxonomy)
      .set({ isActive: false })
      .where(eq(schema.taxonomy.id, locality.id));
    expect(
      visitorFeedPreferencesResponseSchema.parse(await (await request('GET', first.cookie)).json()),
    ).toMatchObject({ homeType: '2-bhk', city: { id: city.id }, locality: null });
    await db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, locality.id));
    await db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, city.id));
    expect(
      visitorFeedPreferencesResponseSchema.parse(await (await request('GET', first.cookie)).json()),
    ).toMatchObject({ homeType: '2-bhk', city: null, locality: null });
  });
});
