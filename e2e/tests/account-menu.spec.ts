import { apiUrl, webUrl } from '../lib/environment';
import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeProject, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';

test('account menu uses real personal data, working destinations, and resilient logout on desktop and mobile', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await assertTestDb();
  const visitor = await makeUser({
    name: 'Menu Visitor',
    role: 'visitor',
    status: 'active',
    phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const designer = await makeDesigner({ status: 'active' });
  const project = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Saved menu project',
  });
  await db
    .insert(schema.visitorProfile)
    .values({ userId: visitor.id, address: 'Bandra West, Mumbai' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const otherDevice = await browser.newContext();
  try {
    await signInPhone(context, visitor.phoneNumber);
    await signInPhone(otherDevice, visitor.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/saved-projects/${project.id}`, {
          headers: { origin: webUrl },
        })
      ).ok(),
    ).toBe(true);
    await page.goto('/home');
    const trigger = page.getByRole('button', { name: 'Open account menu for Menu Visitor' });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('Bandra West, Mumbai', { exact: false })).toBeVisible();
    await expect(menu.getByLabel('Your activity')).toHaveAttribute('aria-busy', 'false');
    await expect(menu.getByLabel('Your activity')).toContainText('1');
    await expect(menu.getByLabel('Your activity')).toContainText('0');
    await expect(menu).not.toContainText(visitor.phoneNumber!);
    await expect(menu.getByRole('menuitem', { name: 'Boards', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Following', exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('account-menu-desktop.png'),
      animations: 'disabled',
    });
    await menu.getByRole('menuitem', { name: 'Log out', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Log out of this device?' });
    await expect(confirmation).toBeVisible();
    const backdrop = page.locator('[data-slot="dialog-overlay"]');
    await expect(backdrop).toHaveCSS('background-color', 'rgba(23, 22, 18, 0.12)');
    await expect(backdrop).toHaveCSS('opacity', '1');
    // The scoped neutral backdrop also stays neutral in dark mode.
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(backdrop).toHaveCSS('background-color', 'rgba(23, 22, 18, 0.12)');
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    // Dialog hides its inert background from accessibility, not from sight.
    const visibleAccountPanel = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(visibleAccountPanel).toBeVisible();
    await expect(visibleAccountPanel).toHaveAttribute('inert', '');
    await expect(async () => {
      const panelBounds = (await visibleAccountPanel.boundingBox())!;
      const confirmationBounds = (await confirmation.boundingBox())!;
      expect(confirmationBounds.x).toBeGreaterThanOrEqual(0);
      expect(confirmationBounds.x + confirmationBounds.width).toBeLessThan(panelBounds.x);
      expect(
        Math.abs(
          confirmationBounds.y + confirmationBounds.height - panelBounds.y - panelBounds.height,
        ),
      ).toBeLessThan(2);
    }).toPass({ timeout: 10_000 });
    await page.screenshot({
      path: testInfo.outputPath('account-logout-side-by-side.png'),
      animations: 'disabled',
    });
    for (const viewport of [
      { width: 1280, height: 320 },
      { width: 700, height: 640 },
      { width: 320, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(async () => {
        const bounds = (await confirmation.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      }).toPass({ timeout: 10_000 });
      await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeInViewport();
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press('Tab');
    await expect(confirmation).toContainText('Log out of all devices');
    expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(confirmation).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Saved projects', exact: true }).click();
    await expect(page).toHaveURL(/\/saved-projects$/);
    await expect(page.getByRole('heading', { name: 'Saved projects', exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByRole('article').hover();
    await page.getByRole('button', { name: 'Remove saved project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No saved projects to show' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.goto('/saved-projects?page=999');
    await expect(page).toHaveURL(/page=1/);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Enquiries', exact: true }).click();
    await expect(page).toHaveURL(/\/enquiries$/);
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'My home profile', exact: true }).click();
    await expect(page).toHaveURL(/\/home\/settings#personal-details$/);
    await expect(page.getByLabel('Personal address (optional)')).toHaveValue('Bandra West, Mumbai');
    await trigger.click();
    await menu
      .getByRole('menuitem', { name: 'Help & report', exact: true })
      .getAttribute('href')
      .then((href) => expect(href).toMatch(/^https:\/\/wa\.me\//));
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    let failCounts = true;
    await page.route('**/api/saved-projects?**', (route) =>
      failCounts
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    await trigger.click();
    await expect(menu.getByLabel('saved count unavailable')).toBeVisible();
    failCounts = false;
    await menu.getByRole('menuitem', { name: 'Some details could not load. Retry' }).click();
    await expect(menu.getByLabel('saved count unavailable')).toHaveCount(0);
    await expect(menu.getByLabel('Your activity')).toHaveAttribute('aria-busy', 'false');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await page.unroute('**/api/saved-projects?**');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 640 });
      await trigger.click();
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await menu.getByRole('menuitem', { name: 'Log out', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Log out of this device?' });
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    await page.screenshot({
      path: testInfo.outputPath('account-menu-mobile.png'),
      animations: 'disabled',
    });
    await menu.getByRole('menuitem', { name: 'Log out', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await page.route('**/api/auth/sign-out', (route) =>
      route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
    );
    await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Could not log out. Please try again.');
    expect(
      (await context.request.get(`${apiUrl}/api/auth/get-session?disableCookieCache=true`)).ok(),
    ).toBe(true);
    await page.unroute('**/api/auth/sign-out');
    await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      await (
        await context.request.get(`${apiUrl}/api/auth/get-session?disableCookieCache=true`)
      ).json(),
    ).toBeNull();
    expect(
      (
        await (
          await otherDevice.request.get(`${apiUrl}/api/auth/get-session?disableCookieCache=true`)
        ).json()
      ).user.id,
    ).toBe(visitor.id);

    await signInPhone(context, visitor.phoneNumber);
    await page.goto('/home');
    await trigger.click();
    await menu.getByRole('menuitem', { name: 'Log out', exact: true }).click();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      await (
        await otherDevice.request.get(`${apiUrl}/api/auth/get-session?disableCookieCache=true`)
      ).json(),
    ).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await otherDevice.close();
    await db.delete(schema.user).where(eq(schema.user.id, visitor.id));
    await db.delete(schema.organization).where(eq(schema.organization.id, designer.orgId));
    if (designer.userId) await db.delete(schema.user).where(eq(schema.user.id, designer.userId));
  }
});

test('saved projects requires authentication', async ({ page }) => {
  await page.goto('/saved-projects');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Saved projects', exact: true })).toHaveCount(0);
});

test('saved projects keeps failed removals retryable and corrects pagination without a reload', async ({
  page,
  context,
}) => {
  await assertTestDb();
  const visitor = await makeUser({
    name: 'Saved List Visitor',
    role: 'visitor',
    status: 'active',
    phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const designer = await makeDesigner({ status: 'active' });
  const projects = await Promise.all(
    ['First saved project', 'Second saved project'].map((title) =>
      makeProject({ designerId: designer.id, status: 'published', title }),
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await signInPhone(context, visitor.phoneNumber);
    for (const project of projects)
      expect(
        (
          await context.request.put(`${apiUrl}/api/saved-projects/${project.id}`, {
            headers: { origin: webUrl },
          })
        ).ok(),
      ).toBe(true);
    await page.goto('/saved-projects?page=2&limit=1');
    await expect(page).toHaveTitle('Saved projects · Tickif');
    const article = page.getByRole('article');
    await expect(article).toHaveCount(1);
    await article.hover();
    await page.route('**/api/saved-projects/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    await article.getByRole('button', { name: 'Remove saved project' }).click();
    await expect(article.getByRole('status')).toHaveText(
      'Could not update saved project. Please try again.',
    );
    await expect(article).toHaveCount(1);
    await expect(page).toHaveURL(/page=2&limit=1$/);
    await page.unroute('**/api/saved-projects/*');
    await article.getByRole('button', { name: 'Remove saved project' }).click();
    await expect(page).toHaveURL(/page=1&limit=1$/);
    await expect(article).toHaveCount(1);
    await expect(page.getByText('1 saved project', { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await article.getByRole('button', { name: 'Remove saved project' }).click();
    await expect(page.getByRole('heading', { name: 'No saved projects to show' })).toBeVisible();
    await expect(article).toHaveCount(0);
    await page.getByRole('button', { name: /Open account menu/ }).click();
    await expect(page.getByRole('menu').getByLabel('Your activity')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(page.getByRole('menu').getByLabel('Your activity')).not.toContainText('1');
    expect(errors).toEqual([]);
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, visitor.id));
    await db.delete(schema.organization).where(eq(schema.organization.id, designer.orgId));
    if (designer.userId) await db.delete(schema.user).where(eq(schema.user.id, designer.userId));
  }
});

test('phone-auth placeholder names use a safe menu label before onboarding', async ({
  page,
  context,
}) => {
  await assertTestDb();
  const phone = `+9197${randomInt(10_000_000, 99_999_999)}`;
  const visitor = await makeUser({
    name: phone,
    phoneNumber: phone,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'pending',
  });
  try {
    await signInPhone(context, phone);
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Open account menu for Account' });
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 640 });
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toContainText('Account');
      await expect(menu).not.toContainText(phone);
      await expect(menu.getByRole('menuitem', { name: 'Complete setup' })).toHaveAttribute(
        'href',
        '/designer/onboarding',
      );
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
  } finally {
    await db.delete(schema.user).where(eq(schema.user.id, visitor.id));
  }
});
