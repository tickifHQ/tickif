import { describe, expect, it } from 'vitest';
import { config } from '@repo/config';
import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  discoveryFeedResponseSchema,
  visitorFeedPreferencesResponseSchema,
  type VisitorFeedFilters,
} from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeTaxonomy } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

const skipped = { homeType: null, citySlug: null, localitySlug: null };
const selected = { homeType: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' };

function request(method: 'GET' | 'PUT', cookie?: string, body?: unknown) {
  return app.request('/api/visitors/me/feed-preferences', {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function seedLocation() {
  const city = await makeTaxonomy({ kind: 'city', slug: 'chennai', label: 'Chennai' });
  await makeTaxonomy({ kind: 'locality', slug: 'adyar', label: 'Adyar', parentId: city.id });
  return city;
}

async function feed(filters: VisitorFeedFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    for (const slug of Array.isArray(value) ? value : [value]) query.append(key, slug);
  }
  const response = await app.request(`/api/discovery/feed?${query}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('public');
  return discoveryFeedResponseSchema.parse(await response.json());
}

describe('/api/visitors/me/feed-preferences', () => {
  it('requires authentication for both methods', async () => {
    expect((await request('GET')).status).toBe(401);
    expect((await request('PUT', undefined, skipped)).status).toBe(401);
  });

  it('persists selections, activates the visitor, and keeps each account private', async () => {
    await seedLocation();
    const first = await createRoleSession('+919800006101', PLATFORM_ROLE.VISITOR);
    const second = await createRoleSession('+919800006102', PLATFORM_ROLE.VISITOR);
    const initial = await request('GET', first.cookie);
    expect(initial.headers.get('cache-control')).toBe('private, no-store');
    await expect(initial.json()).resolves.toEqual({ preferences: null, filters: {} });

    const write = await request('PUT', first.cookie, selected);
    expect(write.status).toBe(200);
    expect(write.headers.get('cache-control')).toBe('private, no-store');
    const saved = visitorFeedPreferencesResponseSchema.parse(await write.json());
    expect(saved).toEqual({
      preferences: selected,
      filters: { bhkSlug: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' },
    });
    await expect((await request('GET', first.cookie)).json()).resolves.toEqual(saved);
    await expect((await request('GET', second.cookie)).json()).resolves.toEqual({
      preferences: null,
      filters: {},
    });
    const [account] = await db
      .select({ status: schema.user.status })
      .from(schema.user)
      .where(eq(schema.user.id, first.userId));
    expect(account?.status).toBe(ACCOUNT_STATUS.ACTIVE);
  });

  it('records a skip and preserves profile fields when either API is updated', async () => {
    const { cookie, userId } = await createRoleSession('+919800006103', PLATFORM_ROLE.VISITOR);
    const writeProfile = () =>
      app.request('/api/visitors/me', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ address: 'Home address', whatsappNumber: '+919800006103' }),
      });
    expect((await writeProfile()).status).toBe(200);
    expect((await request('PUT', cookie, skipped)).status).toBe(200);
    await expect((await request('GET', cookie)).json()).resolves.toEqual({
      preferences: skipped,
      filters: {},
    });
    const selectedHome = { ...skipped, homeType: 'villa' };
    expect((await request('PUT', cookie, selectedHome)).status).toBe(200);
    expect((await writeProfile()).status).toBe(200);
    const [profile] = await db
      .select()
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(profile).toMatchObject({
      address: 'Home address',
      whatsappNumber: '+919800006103',
      feedPreferences: selectedHome,
    });
  });

  it('rejects inactive, missing, and cross-city locations without writing', async () => {
    await seedLocation();
    const otherCity = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
    await makeTaxonomy({
      kind: 'locality',
      slug: 'bandra',
      label: 'Bandra',
      parentId: otherCity.id,
    });
    await makeTaxonomy({ kind: 'city', slug: 'retired', label: 'Retired', isActive: false });
    const { cookie, userId } = await createRoleSession('+919800006104', PLATFORM_ROLE.VISITOR);
    for (const input of [
      { ...selected, citySlug: 'missing' },
      { ...selected, citySlug: 'retired', localitySlug: null },
      { ...selected, localitySlug: 'bandra' },
      { ...selected, localitySlug: 'missing' },
      { ...selected, citySlug: null },
      { ...selected, homeType: 'studio' },
      { ...selected, userId: 'someone-else' },
    ])
      expect((await request('PUT', cookie, input)).status).toBe(422);
    const profiles = await db
      .select()
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(profiles).toEqual([]);
  });

  it.each([
    [PLATFORM_ROLE.DESIGNER, '+919800006105'],
    [PLATFORM_ROLE.ADMIN, '+919800006106'],
    [PLATFORM_ROLE.SUPERADMIN, '+919800006107'],
  ] as const)('rejects %s accounts', async (role, phone) => {
    const { cookie } = await createRoleSession(phone, role);
    expect((await request('GET', cookie)).status).toBe(403);
    expect((await request('PUT', cookie, skipped)).status).toBe(403);
  });

  it('rejects suspended visitors', async () => {
    const { cookie, userId } = await createRoleSession('+919800006108', PLATFORM_ROLE.VISITOR);
    await db
      .update(schema.user)
      .set({ status: ACCOUNT_STATUS.SUSPENDED })
      .where(eq(schema.user.id, userId));
    expect((await request('GET', cookie)).status).toBe(403);
    expect((await request('PUT', cookie, skipped)).status).toBe(403);
  });

  it('feeds both 4-BHK categories, canonical villas, and exact empty results through the existing API', async () => {
    const configured = config.TYPESENSE_SEARCH_CONFIGURED;
    config.TYPESENSE_SEARCH_CONFIGURED = false;
    try {
      await seedLocation();
      const { cookie } = await createRoleSession('+919800006109', PLATFORM_ROLE.VISITOR);
      const designer = await makeDesigner({ status: 'active' });
      const common = {
        designerId: designer.id,
        citySlug: 'chennai',
        localitySlug: 'adyar',
        propertyTypeSlug: 'residential',
      };
      const four = await makeProject({ ...common, bhkSlug: '4-bhk' });
      const larger = await makeProject({ ...common, bhkSlug: '4-plus-bhk' });
      const villa = await makeProject({
        ...common,
        bhkSlug: '3-bhk',
        propertySubtypeSlug: 'villa',
      });
      await makeProject({ ...common, bhkSlug: '4-bhk', status: 'draft' });
      await makeProject({ ...common, bhkSlug: '4-bhk', citySlug: 'mumbai' });

      for (const [homeType, ids] of [
        ['4-plus-bhk', [four.id, larger.id]],
        ['villa', [villa.id]],
        ['1-bhk', []],
      ] as const) {
        const saved = await request('PUT', cookie, { ...selected, homeType });
        expect(saved.status).toBe(200);
        const { filters } = visitorFeedPreferencesResponseSchema.parse(await saved.json());
        const result = await feed(filters);
        expect(result.items.map((item) => item.id).sort()).toEqual([...ids].sort());
        expect(result.fallback).toBe('none');
      }
    } finally {
      config.TYPESENSE_SEARCH_CONFIGURED = configured;
    }
  });
});
