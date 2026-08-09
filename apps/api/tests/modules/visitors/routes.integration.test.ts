import { describe, expect, it } from 'vitest';
import { ACCOUNT_STATUS, PLATFORM_ROLE, visitorProfileResponseSchema } from '@repo/contracts';
import { db, eq, schema, sql } from '@repo/db';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

async function requestJson(
  method: 'GET' | 'PUT',
  cookie?: string,
  body?: unknown,
): Promise<Response> {
  return app.request('/api/visitors/me', {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/visitors/me', () => {
  it('requires authentication for reads and writes', async () => {
    expect((await requestJson('GET')).status).toBe(401);
    expect(
      (await requestJson('PUT', undefined, { address: null, whatsappNumber: null })).status,
    ).toBe(401);
  });

  it('returns 404 until the visitor completes onboarding', async () => {
    const { cookie } = await createRoleSession('+919800005001', PLATFORM_ROLE.VISITOR);

    const response = await requestJson('GET', cookie);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'not_found', message: 'Visitor profile not found' },
    });
  });

  it('persists onboarding data, activates the account, and reads it back', async () => {
    const { cookie, userId } = await createRoleSession('+919800005002', PLATFORM_ROLE.VISITOR);

    const write = await requestJson('PUT', cookie, {
      address: 'Bandra West, Mumbai',
      whatsappNumber: '+919800005002',
    });

    expect(write.status).toBe(200);
    const written = visitorProfileResponseSchema.parse(await write.json());
    expect(written).toMatchObject({
      address: 'Bandra West, Mumbai',
      whatsappNumber: '+919800005002',
      onboardingCompletedAt: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const read = await requestJson('GET', cookie);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual(written);

    const [account] = await db
      .select({ status: schema.user.status, role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    expect(account).toEqual({
      status: ACCOUNT_STATUS.ACTIVE,
      role: PLATFORM_ROLE.VISITOR,
    });
  });

  it('updates one profile without changing the original completion timestamp', async () => {
    const { cookie, userId } = await createRoleSession('+919800005003', PLATFORM_ROLE.VISITOR);
    const first = await requestJson('PUT', cookie, {
      address: 'First address',
      whatsappNumber: '+919800005003',
    });
    const firstBody = visitorProfileResponseSchema.parse(await first.json());

    const second = await requestJson('PUT', cookie, {
      address: null,
      whatsappNumber: null,
    });
    const secondBody = visitorProfileResponseSchema.parse(await second.json());

    expect(second.status).toBe(200);
    expect(secondBody).toMatchObject({
      address: null,
      whatsappNumber: null,
      onboardingCompletedAt: firstBody.onboardingCompletedAt,
      createdAt: firstBody.createdAt,
    });
    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(count?.value).toBe(1);
  });

  it('rejects malformed and ambiguous onboarding data without persisting it', async () => {
    const { cookie, userId } = await createRoleSession('+919800005004', PLATFORM_ROLE.VISITOR);

    for (const body of [
      { address: '   ', whatsappNumber: null },
      { address: null, whatsappNumber: '98000005004' },
      { address: null, whatsappNumber: null, phoneNumber: '+919800005004' },
      { address: null },
    ]) {
      expect((await requestJson('PUT', cookie, body)).status).toBe(422);
    }

    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.visitorProfile)
      .where(eq(schema.visitorProfile.userId, userId));
    expect(count?.value).toBe(0);
  });

  it.each([
    [PLATFORM_ROLE.DESIGNER, '+919800005005'],
    [PLATFORM_ROLE.ADMIN, '+919800005006'],
    [PLATFORM_ROLE.SUPERADMIN, '+919800005007'],
  ] as const)('rejects the %s role', async (role, phoneNumber) => {
    const { cookie } = await createRoleSession(phoneNumber, role);

    expect((await requestJson('GET', cookie)).status).toBe(403);
    expect((await requestJson('PUT', cookie, { address: null, whatsappNumber: null })).status).toBe(
      403,
    );
  });

  it('rejects suspended and banned visitors', async () => {
    const suspended = await createRoleSession('+919800005008', PLATFORM_ROLE.VISITOR);
    await db
      .update(schema.user)
      .set({ status: ACCOUNT_STATUS.SUSPENDED })
      .where(eq(schema.user.id, suspended.userId));

    const banned = await createRoleSession('+919800005009', PLATFORM_ROLE.VISITOR);
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, banned.userId));

    expect((await requestJson('GET', suspended.cookie)).status).toBe(403);
    expect((await requestJson('GET', banned.cookie)).status).toBe(403);
  });
});
