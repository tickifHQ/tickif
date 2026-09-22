import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { phoneCode, removeSyntheticUserByPhone } from '../lib/auth';

test('public sign-in opens over the current page and closes back to it', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible();
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveClass(/backdrop-blur-sm/);
  await expect(page.locator('main').first()).toBeVisible();
  await page.screenshot({ path: '/tmp/tickif-sign-in-modal-desktop.png', animations: 'disabled' });

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('designer sign-in opens in designer mode over the current page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'List your work' }).click();

  await expect(page).toHaveURL(/\/login\?mode=designer$/);
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible();
  await expect(page.getByRole('tab', { name: "I'm a designer" })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a protected public navigation action opens sign-in over the current page', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', {
      name: 'Your Enquiries',
    })
    .click();

  await expect(page).toHaveURL(/\/login\?callbackURL=%2Fenquiries$/);
  await expect(page.getByRole('dialog', { name: 'Sign in to continue' })).toBeVisible();
  await expect(page.locator('main').first()).toBeVisible();
});

test('a direct login visit retains its standalone fallback', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome to Tickif' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mobile designer directory keeps its content behind the sign-in dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/designers');
  await page.getByRole('link', { name: 'Sign in' }).click();

  const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('main').first()).toBeVisible();
  await expect(dialog).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '/tmp/tickif-sign-in-modal-mobile.png', animations: 'disabled' });
});

test('phone OTP in the dialog rejects a wrong code then completes visitor sign-in', async ({
  page,
}) => {
  const phoneNumber = `+9193${randomInt(10_000_000, 99_999_999)}`;
  try {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.getByPlaceholder('9123456789').fill(phoneNumber.slice(3));
    await page.getByRole('button', { name: 'Get OTP', exact: true }).click();
    const firstDigit = page.getByRole('textbox', { name: 'OTP digit 1', exact: true });
    await expect(firstDigit).toBeVisible();
    const code = await phoneCode(phoneNumber);
    await firstDigit.fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Invalid OTP', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await firstDigit.fill(code);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await removeSyntheticUserByPhone(phoneNumber);
  }
});
