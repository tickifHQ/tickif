import { randomUUID } from 'node:crypto';
import { makeWhatsappProof } from '../../helpers/whatsapp.js';
import { hashWhatsappCode } from '../../../src/modules/whatsapp/repository.js';
import { whatsappChallengeResponseSchema, personalAccountSchema } from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';
import { consumeWhatsappProof } from '../../../src/modules/whatsapp/repository.js';

const { deliver } = vi.hoisted(() => ({ deliver: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@repo/auth/phone-otp', () => ({ sendPhoneOtp: deliver }));
function request(path: string, body: unknown, cookie?: string) {
  return app.request(`/api/whatsapp/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
const input = { phoneNumber: '+919800007111', target: 'personal' };

describe('WhatsApp contact verification', () => {
  it('rejects expired codes, cross-user/target proof use and concurrent replay', async () => {
    const { cookie, userId } = await createRoleSession('+919800007116', 'visitor');
    const id = randomUUID();
    await db.insert(schema.whatsappChallenge).values({
      id,
      userId,
      ...input,
      codeHash: hashWhatsappCode(id, '123456'),
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      (await request('verify', { ...input, challengeId: id, code: '123456' }, cookie)).status,
    ).toBe(422);
    const proof = await makeWhatsappProof(userId, input.phoneNumber);
    await expect(
      db.transaction((tx) =>
        consumeWhatsappProof(tx, 'another-user', 'personal', input.phoneNumber, proof),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      db.transaction((tx) =>
        consumeWhatsappProof(tx, userId, 'onboarding', input.phoneNumber, proof),
      ),
    ).rejects.toMatchObject({ status: 422 });
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        db.transaction((tx) =>
          consumeWhatsappProof(tx, userId, 'personal', input.phoneNumber, proof),
        ),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
  it('requires authentication and E.164 input', async () => {
    expect((await request('send', input)).status).toBe(401);
    const { cookie } = await createRoleSession('+919800007110', 'visitor');
    expect((await request('send', { ...input, phoneNumber: '9800007111' }, cookie)).status).toBe(
      422,
    );
  });
  it('verifies an exact number and consumes proof atomically with a contact save', async () => {
    const { cookie, userId } = await createRoleSession('+919800007112', 'visitor');
    const sent = await request('send', input, cookie);
    expect(sent.status).toBe(200);
    const { challengeId } = whatsappChallengeResponseSchema.parse(await sent.json());
    const code = deliver.mock.calls.at(-1)![0].code as string;
    const [stored] = await db
      .select()
      .from(schema.whatsappChallenge)
      .where(eq(schema.whatsappChallenge.id, challengeId));
    expect(stored!.codeHash).not.toContain(code);
    expect((await request('send', input, cookie)).status).toBe(429);
    expect(
      (
        await request(
          'verify',
          { ...input, challengeId, code, phoneNumber: '+919800007113' },
          cookie,
        )
      ).status,
    ).toBe(422);
    // A code verified near its deadline still grants the promised five-minute save window.
    await db
      .update(schema.whatsappChallenge)
      .set({ expiresAt: new Date(Date.now() + 10_000) })
      .where(eq(schema.whatsappChallenge.id, challengeId));
    expect((await request('verify', { ...input, challengeId, code }, cookie)).status).toBe(200);
    const [verified] = await db
      .select()
      .from(schema.whatsappChallenge)
      .where(eq(schema.whatsappChallenge.id, challengeId));
    expect(verified!.expiresAt.getTime() - verified!.verifiedAt!.getTime()).toBe(300_000);
    await expect(
      db.transaction(async (tx) => {
        await consumeWhatsappProof(tx, userId, 'personal', input.phoneNumber, challengeId);
        throw new Error('save rolled back');
      }),
    ).rejects.toThrow('save rolled back');
    await db.transaction((tx) =>
      consumeWhatsappProof(tx, userId, 'personal', input.phoneNumber, challengeId),
    );
    await expect(
      db.transaction((tx) =>
        consumeWhatsappProof(tx, userId, 'personal', input.phoneNumber, challengeId),
      ),
    ).rejects.toThrow('expired or does not match');
  });
  it('rejects bypass attempts when saving a personal contact', async () => {
    const { cookie, userId } = await createRoleSession('+919800007114', 'visitor');
    await db.update(schema.user).set({ status: 'active' }).where(eq(schema.user.id, userId));
    const current = personalAccountSchema.parse(
      await (await app.request('/api/personal-account/me', { headers: { cookie } })).json(),
    );
    const response = await app.request('/api/personal-account/me', {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Verified Contact',
        address: null,
        whatsappNumber: input.phoneNumber,
        revision: current.revision,
      }),
    });
    expect(response.status).toBe(422);
  });
  it('rejects wrong codes after three attempts and expires challenges', async () => {
    const { cookie } = await createRoleSession('+919800007115', 'visitor');
    const { challengeId } = whatsappChallengeResponseSchema.parse(
      await (await request('send', input, cookie)).json(),
    );
    const code = deliver.mock.calls.at(-1)![0].code as string;
    for (let attempt = 0; attempt < 3; attempt++)
      expect(
        (
          await request(
            'verify',
            { ...input, challengeId, code: code === '000000' ? '111111' : '000000' },
            cookie,
          )
        ).status,
      ).toBe(422);
    expect((await request('verify', { ...input, challengeId, code }, cookie)).status).toBe(422);
  });
});
