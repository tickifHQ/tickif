import { apiUrl as stackApiUrl, webUrl as stackWebUrl } from './environment';
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
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
  makeUser,
  migrateTestDb,
} from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';

export const moderationApiUrl = stackApiUrl;

/** Only creates/removes this fixture; never truncates a shared database. */
export async function createProjectModerationFixture() {
  const database = new URL(config.DATABASE_URL);
  const storage = config.R2_ENDPOINT ? new URL(config.R2_ENDPOINT) : null;
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  ) {
    throw new Error(
      'Project moderation E2E requires matching local DATABASE_URL and DATABASE_URL_TEST ending in _test.',
    );
  }
  if (!storage || !['localhost', '127.0.0.1'].includes(storage.hostname))
    throw new Error('Project moderation E2E requires local MinIO storage.');
  await migrateTestDb(config.DATABASE_URL);
  await assertTestDb();
  const suffix = randomUUID();
  const admin = await makeUser({
    name: 'Synthetic Project Admin',
    role: 'admin',
    status: 'active',
    phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const owner = await makeUser({
    name: 'Synthetic Project Owner',
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: `Project moderation ${suffix}` });
  const designer = await makeDesigner({
    userId: owner.id,
    orgId: organization.id,
    displayName: 'Synthetic Moderation Studio',
    status: 'active',
  });
  const roomType = await makeTaxonomy({ kind: 'room', label: `Moderation Room ${suffix}` });
  const originalKey = `originals/moderation-${suffix}.png`;
  await putObject({
    key: originalKey,
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4d0AAAAASUVORK5CYII=',
      'base64',
    ),
    contentType: 'image/png',
  });
  const projects: Array<Awaited<ReturnType<typeof makeProject>>> = [];
  for (let index = 0; index < 21; index++) {
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      title: `Moderation ${suffix} ${String(index + 1).padStart(2, '0')}`,
      submittedAt: new Date(Date.UTC(2000, 0, 1, 0, 0, index)),
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id, roomTypeId: roomType.id });
    for (let image = 0; image < 3; image++)
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        originalKey,
        status: 'ready',
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      });
    projects.push(project);
  }
  return {
    admin,
    projects,
    async cleanup() {
      await assertTestDb();
      const projectIds = projects.map((project) => project.id);
      // Remove only this guarded synthetic fixture's retained moderation records.
      await db
        .delete(schema.projectReviewComment)
        .where(inArray(schema.projectReviewComment.projectId, projectIds));
      await db
        .delete(schema.projectModerationEvent)
        .where(inArray(schema.projectModerationEvent.projectId, projectIds));
      await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
      await db.delete(schema.user).where(inArray(schema.user.id, [owner.id, admin.id]));
      await db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, roomType.id));
      await deleteObject(originalKey);
    },
  };
}

export async function signInProjectAdmin(context: BrowserContext, phoneNumber: string | null) {
  if (!phoneNumber) throw new Error('Synthetic admin needs a phone number.');
  const options = { headers: { origin: stackWebUrl }, data: { phoneNumber } };
  const send = await context.request.post(
    `${moderationApiUrl}/api/auth/phone-number/send-otp`,
    options,
  );
  expect(send.ok()).toBeTruthy();
  const [verification] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, phoneNumber))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const code = verification?.value.split(':')[0];
  if (!code)
    throw new Error('No OTP for this synthetic admin; check API and fixture database alignment.');
  const verify = await context.request.post(`${moderationApiUrl}/api/auth/phone-number/verify`, {
    ...options,
    data: { phoneNumber, code },
  });
  expect(verify.ok()).toBeTruthy();
}
