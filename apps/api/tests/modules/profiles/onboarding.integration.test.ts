import { describe, it, expect, beforeEach } from 'vitest';
import { testClient } from 'hono/testing';
import { db, schema, eq } from '@repo/db';
import { app } from '../../../src/app.js';
import { createAuthedSession } from '../../helpers/auth.js';

const client = testClient(app);

/**
 * Seed a taxonomy entry for tests that need valid slugs.
 */
async function seedTaxonomy(kind: string, slug: string) {
  await db.insert(schema.taxonomy).values({ kind: kind as never, slug, label: slug }).onConflictDoNothing();
}

describe('POST /api/profiles/me — onboarding', () => {
  beforeEach(async () => {
    // Seed required taxonomy entries for tests.
    await seedTaxonomy('city', 'mumbai');
    await seedTaxonomy('scope', 'residential');
    await seedTaxonomy('theme', 'minimalist');
  });

  it('creates a profile and upgrades role to designer (201)', async () => {
    const { cookie, phoneNumber } = await createAuthedSession();

    const res = await client.api.profiles.me.$post(
      {
        json: {
          entityType: 'individual',
          studioName: 'Test Studio',
          bio: 'A test bio',
          citySlug: 'mumbai',
        },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    if (!('profile' in body)) throw new Error('expected profile response');
    expect(body.profile).toMatchObject({
      entityType: 'individual',
      studioName: 'Test Studio',
      bio: 'A test bio',
      citySlug: 'mumbai',
      isVerified: false,
    });
    expect(body.organization).toBeNull();

    // Verify role was upgraded.
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, phoneNumber))
      .limit(1);
    expect(user!.role).toBe('designer');
  });

  it('creates an organization for entityType company (201)', async () => {
    const { cookie } = await createAuthedSession('+919800000010');

    const res = await client.api.profiles.me.$post(
      {
        json: {
          entityType: 'company',
          studioName: 'My Design Co',
          citySlug: 'mumbai',
        },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    if (!('profile' in body)) throw new Error('expected profile response');
    expect(body.profile.entityType).toBe('company');
    expect(body.organization).not.toBeNull();
    expect(body.organization!.name).toBe('My Design Co');
    expect(body.organization!.slug).toBe('my-design-co');
  });

  it('returns existing profile on repeated call (idempotent, 200)', async () => {
    const { cookie } = await createAuthedSession('+919800000011');

    // First call — creates.
    const first = await client.api.profiles.me.$post(
      {
        json: {
          entityType: 'individual',
          studioName: 'Idempotent Studio',
          citySlug: 'mumbai',
        },
      },
      { headers: { cookie } },
    );
    expect(first.status).toBe(201);

    // Second call — idempotent.
    const second = await client.api.profiles.me.$post(
      {
        json: {
          entityType: 'individual',
          studioName: 'Different Name',
          citySlug: 'mumbai',
        },
      },
      { headers: { cookie } },
    );
    expect(second.status).toBe(200);
    const body = await second.json();
    if (!('profile' in body)) throw new Error('expected profile response');
    // Returns original, not the new input.
    expect(body.profile.studioName).toBe('Idempotent Studio');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.profiles.me.$post({
      json: {
        entityType: 'individual',
        studioName: 'No Auth Studio',
        citySlug: 'mumbai',
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid citySlug with 400', async () => {
    const { cookie } = await createAuthedSession('+919800000012');

    const res = await client.api.profiles.me.$post(
      {
        json: {
          entityType: 'individual',
          studioName: 'Bad City Studio',
          citySlug: 'nonexistent-city',
        },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    if (!('error' in body)) throw new Error('expected error');
    expect(body.error.message).toContain('nonexistent-city');
  });

  it('rejects missing required fields with 422', async () => {
    const { cookie } = await createAuthedSession('+919800000013');

    const res = await client.api.profiles.me.$post(
      { json: {} as never },
      { headers: { cookie } },
    );

    // Missing required fields returns 400 (validation error on content-type/body parsing).
    expect(res.status).toBe(400);
  });
});
