import { randomInt, randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { config } from '@repo/config';
import { db, desc, eq, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeUser,
  migrateTestDb,
} from '@repo/db/testing';

export const verificationApiUrl = 'http://localhost:3001';

/** Local-only fixtures: real sessions and persistence, with synthetic identity/documents. */
export async function createVerificationFixture() {
  const database = new URL(config.DATABASE_URL);
  const storage = config.R2_ENDPOINT ? new URL(config.R2_ENDPOINT) : null;
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  ) {
    throw new Error(
      'Verification E2E requires DATABASE_URL and DATABASE_URL_TEST to name the same local *_test database.',
    );
  }
  if (!storage || !['localhost', '127.0.0.1'].includes(storage.hostname)) {
    throw new Error(
      'Verification E2E uploads synthetic documents only to a local MinIO R2_ENDPOINT.',
    );
  }
  await migrateTestDb(config.DATABASE_URL);
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({
    name: 'Synthetic KYC Owner',
    role: 'designer',
    status: 'active',
    phoneNumber: `+9198${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const admin = await makeUser({
    name: 'Synthetic KYC Admin',
    role: 'admin',
    status: 'active',
    phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const organization = await makeOrganization({ name: `KYC lifecycle ${suffix}` });
  await db.insert(schema.member).values({
    id: randomUUID(),
    organizationId: organization.id,
    userId: owner.id,
    role: 'owner',
    createdAt: new Date(),
  });
  const designer = await makeDesigner({
    orgId: organization.id,
    userId: owner.id,
    displayName: 'Synthetic KYC Studio',
    status: 'active',
  });
  for (let index = 0; index < 3; index++) {
    await makeProject({
      designerId: designer.id,
      status: 'published',
      title: `KYC synthetic project ${index}`,
    });
  }
  return {
    owner,
    admin,
    organization,
    async expireApproval(applicationId: string) {
      await assertTestDb();
      await db
        .update(schema.verificationApplication)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(schema.verificationApplication.id, applicationId));
    },
    async cleanup() {
      await assertTestDb();
      const applications = db
        .select({ id: schema.verificationApplication.id })
        .from(schema.verificationApplication)
        .where(eq(schema.verificationApplication.organizationId, organization.id));
      // Production history is retained; only this guarded synthetic fixture is removed.
      await db
        .delete(schema.verificationReviewEvent)
        .where(inArray(schema.verificationReviewEvent.applicationId, applications));
      await db
        .delete(schema.organizationRetention)
        .where(eq(schema.organizationRetention.organizationId, organization.id));
      await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
      await db.delete(schema.user).where(inArray(schema.user.id, [owner.id, admin.id]));
    },
  };
}

export async function signInVerificationUser(context: BrowserContext, phoneNumber: string | null) {
  if (!phoneNumber) throw new Error('The synthetic verification user needs a phone number.');
  const options = { headers: { origin: 'http://localhost:3000' }, data: { phoneNumber } };
  const send = await context.request.post(
    `${verificationApiUrl}/api/auth/phone-number/send-otp`,
    options,
  );
  expect(send.ok(), 'Local OTP request succeeds').toBeTruthy();
  const [verification] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, phoneNumber))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const code = verification?.value.split(':')[0];
  if (!code)
    throw new Error('No OTP for this synthetic phone; check API and fixture database alignment.');
  const verify = await context.request.post(`${verificationApiUrl}/api/auth/phone-number/verify`, {
    ...options,
    data: { phoneNumber, code },
  });
  expect(verify.ok(), 'Real Better Auth session is created').toBeTruthy();
}
