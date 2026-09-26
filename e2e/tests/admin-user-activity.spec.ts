import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { db, schema } from '@repo/db';
import { makeDesigner, makeProject, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';

async function captureQaScreenshot(
  page: Page,
  testInfo: TestInfo,
  issue: 'E-340' | 'E-341',
  name: string,
  options: { fullPage?: boolean } = {},
) {
  const body = await page.screenshot({ animations: 'disabled', ...options });
  await testInfo.attach(name, { body, contentType: 'image/png' });
  const outputRoot = process.env.QA_SCREENSHOT_DIR;
  if (!outputRoot) return;
  const issueDirectory = join(outputRoot, issue);
  await mkdir(issueDirectory, { recursive: true });
  await page.screenshot({
    animations: 'disabled',
    path: join(issueDirectory, `${name}.png`),
    ...options,
  });
}

test('E-340 and E-341 admin directory filters users and shows their recent history', async ({
  context,
  page,
}, testInfo) => {
  const suffix = Date.now().toString().slice(-7);
  const adminPhone = `+919${suffix}01`;
  const targetPhone = `+919${suffix}02`;
  const createdAt = new Date();
  const eventDay = createdAt.toISOString().slice(0, 10);
  const admin = await makeUser({
    name: 'Activity Admin',
    email: `activity-admin-${suffix}@test.local`,
    phoneNumber: adminPhone,
    phoneNumberVerified: true,
    role: 'admin',
    status: 'active',
  });
  const target = await makeUser({
    name: 'Asha Directory QA',
    email: `asha-directory-${suffix}@test.local`,
    phoneNumber: targetPhone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'active',
  });
  await makeUser({
    name: 'Filtered Designer',
    email: `filtered-designer-${suffix}@test.local`,
    role: 'designer',
    status: 'suspended',
  });
  const viewedDesigner = await makeDesigner({ displayName: 'North Star Interiors' });
  const viewedProject = await makeProject({
    designerId: viewedDesigner.id,
    title: 'Sunlit Courtyard Home',
  });
  await db.insert(schema.searchActivity).values({
    actorUserId: target.id,
    endpoint: 'projects',
    query: 'warm minimal kitchen',
    createdAt,
  });
  await db.insert(schema.interactionEvent).values([
    {
      eventKey: randomUUID(),
      type: 'project_view',
      anonymousId: randomUUID(),
      actorUserId: target.id,
      projectId: viewedProject.id,
      eventDay,
      createdAt,
    },
    {
      eventKey: randomUUID(),
      type: 'profile_view',
      anonymousId: randomUUID(),
      actorUserId: target.id,
      designerProfileId: viewedDesigner.id,
      eventDay,
      createdAt,
    },
  ]);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await signInPhone(context, admin.phoneNumber);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/users');
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page).toHaveTitle('User activity · Tickif');
  await expect(page.getByRole('heading', { name: 'User activity' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByLabel('Search users').fill(targetPhone.slice(-7));
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=\d+/);
  await page.getByLabel('Role').selectOption('visitor');
  await expect(page).toHaveURL(/role=visitor/);
  await page.getByLabel('Status').selectOption('active');
  await expect(page).toHaveURL(/status=active/);
  await expect(page.getByText(target.name)).toBeVisible();
  await expect(page.getByText('Filtered Designer')).toHaveCount(0);
  await expect(page.getByText('No recorded activity')).toHaveCount(0);
  await captureQaScreenshot(page, testInfo, 'E-340', 'filtered-users-directory-desktop', {
    fullPage: true,
  });

  await page.getByRole('button', { name: `View recent activity for ${target.name}` }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Recent recorded activity')).toBeVisible();
  await expect(drawer.getByText('warm minimal kitchen')).toBeVisible();
  await drawer.getByRole('tab', { name: /Projects 1/ }).click();
  await expect(drawer.getByText('Sunlit Courtyard Home')).toBeVisible();
  await drawer.getByRole('tab', { name: /Profiles 1/ }).click();
  await expect(drawer.getByText('North Star Interiors')).toBeVisible();
  await captureQaScreenshot(page, testInfo, 'E-341', 'user-history-drawer-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => drawer.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await expect(drawer).toHaveCSS('width', '390px');
  await captureQaScreenshot(page, testInfo, 'E-341', 'user-history-drawer-mobile');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `View recent activity for ${target.name}` }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});

test('E-340 users directory rejects unauthenticated visitors', async ({ page }) => {
  await page.goto('/users?role=designer&page=2');
  await expect(page).toHaveURL('/login?callbackURL=%2Fusers%3Frole%3Ddesigner%26page%3D2');
  await expect(page.getByRole('heading', { name: 'Login to continue' })).toBeVisible();
});
