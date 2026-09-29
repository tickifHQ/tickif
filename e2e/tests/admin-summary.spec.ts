import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { adminActivitySummarySchema } from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl } from '../lib/environment';

test('admin summary matches live totals on desktop and mobile and excludes anonymous visitors', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await assertTestDb();
  const suffix = randomUUID();
  const admin = await makeUser({
    id: `summary-admin-${suffix}`,
    name: 'Summary Admin',
    email: `summary-admin-${suffix}@example.test`,
    phoneNumber: `+9197${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'admin',
    status: 'active',
  });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  try {
    await signInPhone(context, admin.phoneNumber);
    const response = await context.request.get(`${apiUrl}/api/admin/activity/summary`);
    expect(response.ok()).toBeTruthy();
    const summary = adminActivitySummarySchema.parse(await response.json());
    const metrics = [
      ['Total accounts', summary.users],
      ['Active accounts', summary.activeUsers],
      ['Total enquiries', summary.enquiries],
      ['Open enquiries', summary.openEnquiries],
      ['Project views', summary.projectViews],
      ['Profile views', summary.profileViews],
      ['Recorded searches', summary.searches],
    ] as const;

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await expect(page).toHaveTitle('Admin dashboard · Tickif');
    const region = page.getByRole('region', { name: 'Platform summary' });
    await expect(region).toBeVisible();
    for (const [label, value] of metrics) {
      const card = region.locator('[data-slot="card"]').filter({
        has: page.getByText(label, { exact: true }),
      });
      await expect(card.getByText(new Intl.NumberFormat('en-IN').format(value), { exact: true }))
        .toBeVisible();
    }
    await expect(region.getByRole('link')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Admin review queues' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('admin-summary-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(region).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('admin-summary-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('region', { name: 'Admin review queues' })
      .getByRole('link', { name: 'Open queue', exact: true }).first().click();
    await expect(page).toHaveURL(/\/moderation\?status=submitted&page=1$/);

    await context.clearCookies();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?callbackURL=%2Fdashboard$/);
    await expect(page.getByText('Total accounts', { exact: true })).toHaveCount(0);
    expect((await context.request.get(`${apiUrl}/api/admin/activity/summary`)).status()).toBe(401);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.user).where(eq(schema.user.id, admin.id));
  }
});
