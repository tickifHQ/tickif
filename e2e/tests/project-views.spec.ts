import { apiUrl as stackApiUrl, webUrl as stackWebUrl } from '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { config } from '@repo/config';
import { db, desc, eq, inArray, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeUser,
  migrateTestDb,
} from '@repo/db/testing';
import { putObject, deleteObject } from '@repo/storage';
import { makePublicPortfolio } from '../lib/public-portfolio';

test('project views persist across detail and portfolio pages without changing saves', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const database = new URL(config.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  )
    throw new Error('Views E2E requires matching isolated local test database URLs.');
  await migrateTestDb(config.DATABASE_URL);
  await assertTestDb();
  const visitor = await makeUser({
    role: 'visitor',
    status: 'active',
    phoneNumber: `+9195${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const designer = await makeDesigner({
    status: 'active',
    displayName: 'Synthetic Views Studio',
    slug: `views-studio-${randomUUID()}`,
    bio: 'Synthetic views studio biography.',
    logoImageId: 'e2e/public/views-studio-logo.png',
  });
  await makePublicPortfolio({ profileId: designer.id, portfolioSlug: designer.slug });
  const project = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Synthetic Views Project',
  });
  const imageKey = `e2e/views/${randomUUID()}.jpg`;
  await putObject({
    key: imageKey,
    contentType: 'image/jpeg',
    body: await readFile(
      resolve('../apps/web/public/images/home-hero/warm-pendant-living-room.jpg'),
    ),
  });
  const projectImage = await makeProjectImage({
    projectId: project.id,
    status: 'ready',
    originalKey: imageKey,
    width: 1280,
    height: 960,
    derivatives: [{ variant: 'large', format: 'jpeg', key: imageKey, width: 1280, height: 960 }],
  });
  await db
    .update(schema.project)
    .set({ coverImageId: projectImage.id })
    .where(eq(schema.project.id, project.id));
  await db
    .update(schema.designerProfile)
    .set({ logoImageId: imageKey })
    .where(eq(schema.designerProfile.id, designer.id));
  const path = `/projects/${project.id}`;
  const projectActions = page.getByRole('complementary', {
    name: 'Synthetic Views Studio project designer',
    exact: true,
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    await page.goto(path);
    await expect(projectActions.getByRole('img', { name: '0 project views' })).toBeVisible();
    await expect(page.getByRole('button', { name: /like project/i })).toHaveCount(0);

    const headers = { origin: stackWebUrl };
    const phoneNumber = visitor.phoneNumber!;
    expect(
      (
        await context.request.post(`${stackApiUrl}/api/auth/phone-number/send-otp`, {
          headers,
          data: { phoneNumber },
        })
      ).ok(),
    ).toBeTruthy();
    const [verification] = await db
      .select()
      .from(schema.verification)
      .where(eq(schema.verification.identifier, phoneNumber))
      .orderBy(desc(schema.verification.createdAt))
      .limit(1);
    const code = verification?.value.split(':')[0];
    if (!code) throw new Error('Synthetic visitor OTP missing.');
    expect(
      (
        await context.request.post(`${stackApiUrl}/api/auth/phone-number/verify`, {
          headers,
          data: { phoneNumber, code },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto(path);
    await expect(
      projectActions.getByRole('img', { name: '1 project view', exact: true }),
    ).toBeVisible();
    await projectActions.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('views-desktop.png'),
      animations: 'disabled',
    });
    await expect(
      projectActions.getByRole('button', { name: 'Save project', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await projectActions.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(
      projectActions.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      projectActions.getByRole('img', { name: '1 project view', exact: true }),
    ).toBeVisible();
    await page.goto(`/image/${projectImage.id}`);
    await expect(page.getByRole('img', { name: '1 project view', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove bookmark', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('img', { name: '1 project view', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('image-views-desktop.png'),
      animations: 'disabled',
    });
    await page.goto(`/d/${designer.slug}`);
    await expect(page.getByRole('img', { name: '1 project view', exact: true })).toBeVisible();
    await page.goto(path);
    await expect(
      projectActions.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /like project/i })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await projectActions.scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('views-mobile.png'),
      animations: 'disabled',
      fullPage: true,
    });
    expect(runtimeErrors).toEqual([]);
  } finally {
    await deleteObject(imageKey);
    await assertTestDb();
    await db.delete(schema.organization).where(eq(schema.organization.id, designer.orgId));
    await db.delete(schema.user).where(
      inArray(
        schema.user.id,
        [visitor.id, designer.userId].filter((id): id is string => id !== null),
      ),
    );
  }
});
