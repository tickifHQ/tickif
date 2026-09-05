import { describe, expect, it } from 'vitest';
import { personalAccountSchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeOrganization } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { personalAccountRepository } from '../../../src/modules/personal-account/repository.js';
import { activateOrganization, createRoleSession } from '../../helpers/auth.js';

function request(method: 'GET' | 'PATCH', cookie?: string, body?: unknown) {
  return app.request('/api/personal-account/me', {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function account(
  role: 'visitor' | 'designer' | 'admin' = 'visitor',
  phone = '+919800010001',
) {
  const result = await createRoleSession(phone, role);
  await db
    .update(schema.user)
    .set({ status: 'active', name: 'Personal Name' })
    .where(eq(schema.user.id, result.userId));
  return result;
}
async function read(cookie: string) {
  const response = await request('GET', cookie);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  return personalAccountSchema.parse(await response.json());
}
const changes = { name: 'Updated Name', address: 'Mumbai', whatsappNumber: '+919876543210' };

describe('personal account settings', () => {
  it('requires authentication for reads and writes', async () => {
    expect((await request('GET')).status).toBe(401);
    expect(
      (await request('PATCH', undefined, { ...changes, revision: 'a'.repeat(64) })).status,
    ).toBe(401);
  });
  it.each(['visitor', 'designer'] as const)(
    'persists the %s personal details and leaves organization/profile/contact data unchanged',
    async (role) => {
      const { cookie, userId } = await account(role);
      const org = await makeOrganization();
      const designer = await makeDesigner({ userId, orgId: org.id, displayName: 'Studio Name' });
      const original = await read(cookie);
      const response = await request('PATCH', cookie, { ...changes, revision: original.revision });
      expect(response.status).toBe(200);
      const saved = personalAccountSchema.parse(await response.json());
      expect(saved).toMatchObject({
        ...changes,
        email: original.email,
        phoneNumber: original.phoneNumber,
        emailVerified: original.emailVerified,
        phoneNumberVerified: original.phoneNumberVerified,
      });
      expect(saved.revision).not.toBe(original.revision);
      expect(await read(cookie)).toEqual(saved);
      const [studio] = await db
        .select()
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, designer.id));
      expect(studio?.displayName).toBe('Studio Name');
      const [organization] = await db
        .select()
        .from(schema.organization)
        .where(eq(schema.organization.id, org.id));
      expect(organization?.name).toBe(org.name);
      const cleared = await request('PATCH', cookie, {
        name: changes.name,
        address: null,
        whatsappNumber: null,
        revision: saved.revision,
      });
      expect(cleared.status).toBe(200);
      expect(await read(cookie)).toMatchObject({ address: null, whatsappNumber: null });
    },
  );
  it('rejects invalid, identity, ownership, and privilege fields without mutation', async () => {
    const { cookie } = await account();
    const original = await read(cookie);
    for (const patch of [
      { name: ' ' },
      { name: 'a'.repeat(101) },
      { address: 'x'.repeat(301) },
      { whatsappNumber: '9876543210' },
      { email: 'changed@example.com' },
      { phoneNumber: '+919876543210' },
      { emailVerified: true },
      { role: 'admin' },
      { organizationId: 'other-org' },
      { userId: 'other-user' },
      { revision: 'invalid' },
    ]) {
      expect(
        (await request('PATCH', cookie, { ...changes, revision: original.revision, ...patch }))
          .status,
      ).toBe(422);
    }
    expect(await read(cookie)).toEqual(original);
  });
  it('prevents concurrent saves and stale overwrite through either account or onboarding APIs', async () => {
    const { cookie } = await account();
    const original = await read(cookie);
    const results = await Promise.all(
      ['First Name', 'Second Name'].map((name) =>
        request('PATCH', cookie, { ...changes, name, revision: original.revision }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await read(cookie);
    const onboarding = await app.request('/api/visitors/me', {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ address: 'Elsewhere', whatsappNumber: null }),
    });
    expect(onboarding.status).toBe(200);
    expect(
      (await request('PATCH', cookie, { ...changes, revision: current.revision })).status,
    ).toBe(409);
    expect(await read(cookie)).toMatchObject({ address: 'Elsewhere' });
  });
  it('isolates users and rejects another account revision', async () => {
    const first = await account();
    const second = await account('visitor', '+919800010002');
    const firstProfile = await read(first.cookie);
    expect(
      (await request('PATCH', second.cookie, { ...changes, revision: firstProfile.revision }))
        .status,
    ).toBe(409);
    expect(await read(first.cookie)).toEqual(firstProfile);
    expect(await read(second.cookie)).toMatchObject({ name: 'Personal Name', address: null });
  });
  it('rejects organization context and rechecks changed session scope inside persistence', async () => {
    const { cookie, userId } = await account('designer');
    const original = await read(cookie);
    const org = await makeOrganization();
    await db
      .insert(schema.member)
      .values({
        id: 'personal-settings-member',
        organizationId: org.id,
        userId,
        role: 'owner',
        createdAt: new Date(),
      });
    const orgCookie = await activateOrganization(cookie, org.id);
    expect((await request('GET', orgCookie)).status).toBe(403);
    expect(
      (await request('PATCH', orgCookie, { ...changes, revision: original.revision })).status,
    ).toBe(403);
    const [session] = await db
      .select()
      .from(schema.session)
      .where(eq(schema.session.userId, userId));
    expect(session).toBeDefined();
    await expect(
      personalAccountRepository.access(userId, session!.id, {
        ...changes,
        revision: original.revision,
      }),
    ).resolves.toEqual({ kind: 'forbidden' });
  });
  it.each(['pending', 'suspended', 'deleted', 'banned', 'admin'] as const)(
    'rejects live %s state even after an earlier authorized read',
    async (state) => {
      const { cookie, userId } = await account();
      const original = await read(cookie);
      await db
        .update(schema.user)
        .set(
          state === 'banned'
            ? { banned: true }
            : state === 'admin'
              ? { role: 'admin' }
              : { status: state },
        )
        .where(eq(schema.user.id, userId));
      expect((await request('GET', cookie)).status).toBe(403);
      expect(
        (await request('PATCH', cookie, { ...changes, revision: original.revision })).status,
      ).toBe(403);
      const [session] = await db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, userId));
      if (session)
        await expect(
          personalAccountRepository.access(userId, session.id, {
            ...changes,
            revision: original.revision,
          }),
        ).resolves.toEqual({ kind: 'forbidden' });
      const [user] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
      expect(user?.name).toBe(original.name);
    },
  );
});
