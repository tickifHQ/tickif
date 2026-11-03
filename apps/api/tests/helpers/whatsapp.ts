import { randomUUID } from 'node:crypto';
import { db, schema } from '@repo/db';

/** Persistence fixtures; full OTP behavior is covered by whatsapp integration tests. */
export async function makeWhatsappProof(userId: string, phoneNumber: string, target = 'personal') {
  const id = randomUUID();
  await db
    .insert(schema.whatsappChallenge)
    .values({
      id,
      userId,
      phoneNumber,
      target,
      codeHash: 'fixture',
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 300_000),
    });
  return id;
}
