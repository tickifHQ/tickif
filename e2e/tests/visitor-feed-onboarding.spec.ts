import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { signInPhoneUi, phoneCode, removeSyntheticUserByPhone } from '../lib/auth';
import { db, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeUser,
} from '@repo/db/testing';
import { makePublicPortfolio } from '../lib/public-portfolio';
import { webUrl } from '../lib/environment';

test('post-OTP modal retains the interrupted project action and keeps keyboard focus contained', async ({
  page,
}, testInfo) => {
  await assertTestDb();
  const owner = await makeUser({ role: 'designer', status: 'active' });
  const organization = await makeOrganization();
  const phone = `+9194${randomInt(10_000_000, 99_999_999)}`;
  try {
    const designer = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      status: 'active',
    });
    await makePublicPortfolio({ profileId: designer.id, portfolioSlug: designer.slug });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Synthetic modal journey',
    });
    await page.goto(`/projects/${project.id}`);
    await page.getByRole('button', { name: 'Sign in to save project', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('9123456789').fill(phone.slice(3));
    await dialog.getByRole('button', { name: 'Get OTP', exact: true }).click();
    await dialog
      .getByRole('textbox', { name: 'OTP digit 1', exact: true })
      .fill(await phoneCode(phone));
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: "You're in, welcome!" })).toBeVisible();
    await expect(page).toHaveURL(`${webUrl}/projects/${project.id}`);
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await dialog.getByRole('button', { name: 'Skip', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Skip', exact: true })).toBeInViewport();
    await dialog.screenshot({
      path: testInfo.outputPath('visitor-preferences-modal-mobile.png'),
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(`${webUrl}/projects/${project.id}`);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Remove saved project', exact: true }),
    ).toBeVisible();
  } finally {
    await removeSyntheticUserByPhone(phone);
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
  }
});

test('visitor onboarding handles failed lookups, save retries, expired sessions and responsive recovery', async ({
  page,
}, testInfo) => {
  const phone = `+9193${randomInt(10_000_000, 99_999_999)}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/api/taxonomy/terms?**', (route) =>
      route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }),
    );
    await signInPhoneUi(page, phone);
    const card = page.getByTestId('visitor-feed-onboarding');
    await expect(card).toBeVisible();
    await expect(card.getByText(/Could not load locations/)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Show my feed' })).toBeDisabled();
    await page.unroute('**/api/taxonomy/terms?**');
    await card.getByRole('button', { name: 'Retry' }).click();
    await card.getByRole('radio', { name: 'Villa', exact: true }).click();
    await card.getByRole('combobox', { name: 'Where is it?' }).click();
    await page.getByTestId('city-chennai').click();
    await card.getByRole('button', { name: 'Adyar', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Show my feed' })).toBeEnabled();
    await card.screenshot({
      path: testInfo.outputPath('visitor-preferences-desktop.png'),
      animations: 'disabled',
    });

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await card.getByRole('button', { name: 'Show my feed' }).scrollIntoViewIfNeeded();
      await expect(card.getByRole('button', { name: 'Show my feed' })).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(`visitor-preferences-${viewport.width}.png`),
        animations: 'disabled',
        fullPage: true,
      });
    }
    await page.route('**/api/visitors/me/feed-preferences', (route) =>
      route.fulfill({ status: 503, json: { error: { message: 'Could not save. Try again.' } } }),
    );
    await card.getByRole('button', { name: 'Show my feed' }).click();
    await expect(card.getByRole('alert')).toContainText('Could not save');
    await expect(card.getByRole('radio', { name: 'Villa', exact: true })).toBeChecked();
    await page.unroute('**/api/visitors/me/feed-preferences');

    // Reload after verification recovers the same form without redoing OTP.
    await page.goto('/onboarding');
    await expect(card).toBeVisible();
    await page.route('**/api/visitors/me/feed-preferences', (route) =>
      route.fulfill({ status: 401, json: { error: { message: 'Sign in required' } } }),
    );
    await card.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(card.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login',
    );
    await page.unroute('**/api/visitors/me/feed-preferences');
    await card.getByRole('button', { name: 'Close onboarding' }).click();
    await expect(page).toHaveURL(/\/home$/);
    expect(errors).toEqual([]);
  } finally {
    await removeSyntheticUserByPhone(phone);
  }
});
