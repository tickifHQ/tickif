import { apiUrl as stackApiUrl, webUrl as stackWebUrl } from '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { config } from '@repo/config';
import { db, desc, eq, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeProject, makeUser, migrateTestDb } from '@repo/db/testing';

test('visitor likes persist across project and portfolio views independently of bookmarks', async ({
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
    throw new Error('Likes E2E requires matching isolated local test database URLs.');
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
    displayName: 'Synthetic Likes Studio',
    slug: `likes-studio-${randomUUID()}`,
  });
  const project = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Synthetic Likes Project',
  });
  const path = `/projects/${project.id}`;
  const projectActions = page.getByRole('complementary', {
    name: 'Synthetic Likes Studio project designer',
    exact: true,
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    await page.goto(path);
    await projectActions
      .getByRole('button', { name: 'Sign in to like project', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login\?callbackURL=/);
    expect(new URL(page.url()).searchParams.get('callbackURL')).toBe(path);

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
    await projectActions.getByRole('button', { name: 'Like project', exact: true }).click();
    await expect(
      projectActions.getByRole('button', { name: 'Unlike project', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      projectActions.getByRole('button', { name: 'Unlike project', exact: true }),
    ).toContainText('1');
    await expect(
      projectActions.getByRole('button', { name: 'Save project', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await projectActions.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(
      projectActions.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      projectActions.getByRole('button', { name: 'Unlike project', exact: true }),
    ).toBeVisible();
    await page.goto(`/d/${designer.slug}`);
    await expect(page.getByRole('button', { name: 'Unlike project', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Unlike project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Like project', exact: true })).toContainText(
      '0',
    );
    await page.goto(path);
    await expect(
      projectActions.getByRole('button', { name: 'Like project', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(
      projectActions.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('likes-mobile.png'),
      animations: 'disabled',
      fullPage: true,
    });
    expect(runtimeErrors).toEqual([]);
  } finally {
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
