import { apiUrl as stackApiUrl, webUrl as stackWebUrl } from '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { config } from '@repo/config';
import { db, desc, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';

const apiUrl = stackApiUrl;
const webOrigin = stackWebUrl;
const otpResponseSchema = /^\d{4,8}/;

function assertLocalTestEnvironment() {
  const database = new URL(config.DATABASE_URL);
  const api = new URL(apiUrl);
  if (
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    !['localhost', '127.0.0.1'].includes(api.hostname) ||
    !database.pathname.endsWith('_test') ||
    config.DATABASE_URL !== config.DATABASE_URL_TEST
  ) {
    throw new Error(
      'Personal settings E2E requires a local API and matching local database URLs ending in _test.',
    );
  }
}

async function signIn(context: BrowserContext, syntheticPhone: string) {
  const sent = await context.request.post(`${apiUrl}/api/auth/phone-number/send-otp`, {
    headers: { origin: webOrigin },
    data: { phoneNumber: syntheticPhone },
  });
  expect(sent.ok()).toBeTruthy();
  const [row] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, syntheticPhone))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const code = row?.value.match(otpResponseSchema)?.[0];
  expect(code).toBeTruthy();
  const verified = await context.request.post(`${apiUrl}/api/auth/phone-number/verify`, {
    headers: { origin: webOrigin },
    data: { phoneNumber: syntheticPhone, code },
  });
  expect(verified.ok()).toBeTruthy();
}

test.describe('personal settings with persisted accounts', () => {
  test.describe.configure({ mode: 'serial' });
  let userId: string;
  let syntheticEmail: string;
  let syntheticPhone: string;

  test.beforeEach(async () => {
    assertLocalTestEnvironment();
    await assertTestDb();
    const suffix = randomUUID();
    syntheticEmail = `settings-person-${suffix}@example.test`;
    syntheticPhone = `+9197${randomInt(10_000_000, 100_000_000)}`;
    const user = await makeUser({
      name: syntheticPhone,
      email: syntheticEmail,
      phoneNumber: syntheticPhone,
      phoneNumberVerified: true,
      role: 'visitor',
      status: 'active',
    });
    userId = user.id;
  });

  test.afterEach(async () => {
    await assertTestDb();
    if (userId) await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  test('edits personal details from My Tickif, survives reload, and detects another tab save', async ({
    page,
    context,
  }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await signIn(context, syntheticPhone);
    await page.goto('/home');
    await expect(
      page.getByRole('button', { name: 'Open account menu for Account', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Open account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/settings$/);
    await expect(page).toHaveTitle('Personal settings · Tickif');
    await expect(
      page.getByRole('heading', { name: 'Personal settings', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`${syntheticEmail} (Verified)`)).toBeVisible();
    await expect(page.getByLabel('Display name')).toHaveValue('');
    await expect(page.getByLabel('Display name')).toHaveAttribute('placeholder', 'Enter your name');
    await expect(page.getByText(`${syntheticPhone} (Verified)`)).toHaveRole('definition');
    await expect(page.getByRole('textbox')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('new-visitor-desktop.png'), fullPage: true });
    const desktopViewport = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('new-visitor-mobile.png'), fullPage: true });
    await page.setViewportSize(desktopViewport);
    await page.getByLabel('Personal address (optional)').fill('Bandra West, Mumbai');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Display name')).toBeFocused();
    expect(
      await page
        .getByLabel('Display name')
        .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
    ).toBeTruthy();
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.getByLabel('Display name').fill('Updated Person');
    await page.getByLabel('Personal address (optional)').fill('Bandra West, Mumbai');
    await page.getByLabel('WhatsApp number (optional)').fill('+919876543210');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toHaveText('Personal settings saved.');
    const updatedMenu = page.getByRole('button', {
      name: 'Open account menu for Updated Person',
      exact: true,
    });
    await expect(updatedMenu).toBeVisible();
    const initials = await updatedMenu
      .locator('img[src^="data:image/svg+xml"]')
      .getAttribute('src');
    expect(decodeURIComponent(initials!)).toContain('>UP</text>');
    await updatedMenu.click();
    await expect(page.getByRole('menu').getByText('Updated Person', { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('updated-name-account-menu.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Back to My Tickif' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Good (morning|afternoon|evening), Updated/,
    );
    await page
      .getByRole('button', { name: 'Open account menu for Updated Person', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/settings$/);
    await page.reload();
    await expect(page.getByLabel('Display name')).toHaveValue('Updated Person');
    await expect(page.getByText(`${syntheticPhone} (Verified)`)).toHaveRole('definition');
    await expect(page.getByLabel('Personal address (optional)')).toHaveValue('Bandra West, Mumbai');
    await expect(page.getByLabel('WhatsApp number (optional)')).toHaveValue('+919876543210');
    const other = await context.newPage();
    await other.goto('/home/settings');
    await other.getByLabel('Personal address (optional)').fill('Saved in another tab');
    await other.getByRole('button', { name: 'Save changes' }).click();
    await expect(other.getByRole('status')).toHaveText('Personal settings saved.');
    await page.getByLabel('Personal address (optional)').fill('Stale edit');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      page.getByRole('form', { name: 'Personal settings' }).getByRole('alert'),
    ).toContainText('changed elsewhere');
    await expect(page.getByLabel('Personal address (optional)')).toHaveValue('Stale edit');
    await page.getByRole('button', { name: 'Reload latest settings' }).click();
    await expect(page.getByLabel('Personal address (optional)')).toHaveValue(
      'Saved in another tab',
    );
    await page.screenshot({
      path: testInfo.outputPath('personal-settings-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath('personal-settings-mobile.png'),
      fullPage: true,
    });
    await other.close();
    expect(pageErrors).toEqual([]);
  });

  test('redirects an anonymous visitor to login', async ({ page }) => {
    await page.goto('/home/settings');
    await expect(page).toHaveURL(/\/login/);
  });
});
