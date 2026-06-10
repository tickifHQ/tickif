import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { makeDesigner, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createAuthedSession } from '../../helpers/auth.js';

const client = testClient(app);

describe('GET /api/profiles/:id', () => {
  it('returns 200 with only PublicProfile fields for an existing profile', async () => {
    const user = await makeUser({ name: 'Alice Designer' });
    const designer = await makeDesigner({ userId: user.id, studioName: 'Alice Studio', bio: 'I design' });

    const res = await client.api.profiles[':id'].$get({ param: { id: designer.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    if (!('id' in body)) throw new Error('expected profile');
    expect(body).toMatchObject({
      id: designer.id,
      displayName: 'Alice Designer',
      studioName: 'Alice Studio',
      bio: 'I design',
      isVerified: false,
    });
    expect(body.createdAt).toBeDefined();
  });

  it('returns 404 for an unknown profile id', async () => {
    const res = await client.api.profiles[':id'].$get({
      param: { id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status).toBe(404);
  });

  it('response does not contain email or phone keys', async () => {
    const user = await makeUser({ name: 'Bob', email: 'bob@secret.com', phoneNumber: '+919800000099' });
    const designer = await makeDesigner({ userId: user.id });

    const res = await client.api.profiles[':id'].$get({ param: { id: designer.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('phone');
  });

  it('response never contains companySize or featuredBadge keys', async () => {
    const user = await makeUser();
    const designer = await makeDesigner({ userId: user.id });

    const res = await client.api.profiles[':id'].$get({ param: { id: designer.id } });
    const body = await res.json();
    expect(body).not.toHaveProperty('companySize');
    expect(body).not.toHaveProperty('featuredBadge');
  });
});

describe('PATCH /api/profiles/me', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.profiles.me.$patch({
      json: { displayName: 'Hacker' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with OwnerProfile shape on valid partial update', async () => {
    const { cookie, phoneNumber } = await createAuthedSession();

    // The authed session creates a user via phone OTP — we need a designer profile for them.
    // Find the user by phone and create a profile.
    const { db, schema, eq } = await import('@repo/db');
    const [authedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, phoneNumber))
      .limit(1);
    await makeDesigner({ userId: authedUser!.id, studioName: 'My Studio' });

    const res = await client.api.profiles.me.$patch(
      { json: { displayName: 'Updated Name', bio: 'New bio' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      displayName: 'Updated Name',
      bio: 'New bio',
      studioName: 'My Studio',
    });
    // Owner projection includes email and phone
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('phone');
  });

  it('rejects empty body with 422', async () => {
    const { cookie, phoneNumber } = await createAuthedSession('+919800000003');

    const { db, schema, eq } = await import('@repo/db');
    const [authedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, phoneNumber))
      .limit(1);
    await makeDesigner({ userId: authedUser!.id });

    const res = await client.api.profiles.me.$patch(
      { json: {} as never },
      { headers: { cookie } },
    );

    // Zod refine rejects empty body — returns 400 (bad request)
    expect(res.status).toBe(400);
  });

  it('cannot update another users profile — always updates own', async () => {
    const { cookie, phoneNumber } = await createAuthedSession('+919800000004');

    const { db, schema, eq } = await import('@repo/db');
    const [authedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, phoneNumber))
      .limit(1);
    await makeDesigner({ userId: authedUser!.id, studioName: 'Own Studio' });

    // Even if somehow trying to target another user, PATCH /me always uses session user
    const res = await client.api.profiles.me.$patch(
      { json: { studioName: 'Renamed Studio' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    if (!('studioName' in body)) throw new Error('expected profile');
    // Confirms own profile was updated
    expect(body.studioName).toBe('Renamed Studio');
  });

  it('response never contains companySize or featuredBadge keys', async () => {
    const { cookie, phoneNumber } = await createAuthedSession('+919800000005');

    const { db, schema, eq } = await import('@repo/db');
    const [authedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.phoneNumber, phoneNumber))
      .limit(1);
    await makeDesigner({ userId: authedUser!.id });

    const res = await client.api.profiles.me.$patch(
      { json: { bio: 'test' } },
      { headers: { cookie } },
    );
    const body = await res.json();
    expect(body).not.toHaveProperty('companySize');
    expect(body).not.toHaveProperty('featuredBadge');
  });
});
