import { createHmac } from 'node:crypto';
import { and, db, eq, gt, schema } from '@repo/db';
import { config } from '@repo/config';
import { AppError } from '../../lib/errors.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function hashWhatsappCode(id: string, code: string): string {
  return createHmac('sha256', config.BETTER_AUTH_SECRET).update(`${id}:${code}`).digest('hex');
}

/** A failed save rolls back proof consumption with the contact write. */
export async function consumeWhatsappProof(
  tx: Tx,
  userId: string,
  target: string,
  phoneNumber: string,
  verificationId?: string,
): Promise<void> {
  if (!verificationId) throw AppError.unprocessable('Verify this WhatsApp number before saving.');
  const [proof] = await tx
    .select()
    .from(schema.whatsappChallenge)
    .where(eq(schema.whatsappChallenge.id, verificationId))
    .for('update');
  if (
    !proof ||
    proof.userId !== userId ||
    proof.target !== target ||
    proof.phoneNumber !== phoneNumber ||
    !proof.verifiedAt ||
    proof.consumedAt ||
    proof.expiresAt <= new Date()
  ) {
    throw AppError.unprocessable('WhatsApp verification expired or does not match. Verify again.');
  }
  await tx
    .update(schema.whatsappChallenge)
    .set({ consumedAt: new Date() })
    .where(eq(schema.whatsappChallenge.id, proof.id));
}

export const whatsappRepository = {
  async create(input: {
    id: string;
    userId: string;
    target: string;
    phoneNumber: string;
    codeHash: string;
  }) {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .for('update');
      const recent = await tx
        .select({ id: schema.whatsappChallenge.id })
        .from(schema.whatsappChallenge)
        .where(
          and(
            eq(schema.whatsappChallenge.userId, input.userId),
            eq(schema.whatsappChallenge.target, input.target),
            eq(schema.whatsappChallenge.phoneNumber, input.phoneNumber),
            gt(schema.whatsappChallenge.createdAt, new Date(Date.now() - 60_000)),
          ),
        );
      if (recent.length) return false;
      const hourly = await tx
        .select({ id: schema.whatsappChallenge.id })
        .from(schema.whatsappChallenge)
        .where(
          and(
            eq(schema.whatsappChallenge.userId, input.userId),
            gt(schema.whatsappChallenge.createdAt, new Date(Date.now() - 3_600_000)),
          ),
        );
      if (hourly.length >= 10) return false;
      await tx
        .insert(schema.whatsappChallenge)
        .values({ ...input, expiresAt: new Date(Date.now() + 300_000) });
      return true;
    });
  },
  async invalidate(id: string) {
    await db
      .update(schema.whatsappChallenge)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.whatsappChallenge.id, id));
  },
  async verify(
    userId: string,
    input: { challengeId: string; target: string; phoneNumber: string; code: string },
  ) {
    return db.transaction(async (tx) => {
      const [challenge] = await tx
        .select()
        .from(schema.whatsappChallenge)
        .where(eq(schema.whatsappChallenge.id, input.challengeId))
        .for('update');
      if (
        !challenge ||
        challenge.userId !== userId ||
        challenge.target !== input.target ||
        challenge.phoneNumber !== input.phoneNumber ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 3 ||
        challenge.consumedAt ||
        challenge.verifiedAt
      )
        return false;
      const valid = challenge.codeHash === hashWhatsappCode(challenge.id, input.code);
      const verifiedAt = new Date();
      await tx
        .update(schema.whatsappChallenge)
        .set({
          attempts: challenge.attempts + 1,
          ...(valid ? { verifiedAt, expiresAt: new Date(verifiedAt.getTime() + 300_000) } : {}),
        })
        .where(eq(schema.whatsappChallenge.id, challenge.id));
      return valid;
    });
  },
};
