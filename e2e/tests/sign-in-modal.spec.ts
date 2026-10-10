import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { phoneCode, removeSyntheticUserByPhone } from '../lib/auth';

// Exercise native scrollbar geometry, which headless Chromium hides by default.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

for (const width of [852, 516, 489, 390, 320]) {
  test(`sign-in fits ${width}px without shifting the page or reserving inactive form space`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/designers');
    const main = page.locator('main').first();
    const before = await main.boundingBox();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
    await expect(dialog).toBeVisible();
    // The backdrop must cover the whole viewport, including the former scrollbar gutter.
    const backdrop = await page.locator('[data-slot="dialog-overlay"]').boundingBox();
    expect(
      Math.abs(backdrop!.width - (await page.evaluate(() => window.innerWidth))),
    ).toBeLessThanOrEqual(1);
    const after = await main.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
    expect(
      await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);

    const agreement = dialog.getByText(/By continuing you agree/);
    await expect(agreement).toBeInViewport({ ratio: 1 });
    const phoneField = dialog.locator('[data-slot="phone-number-input"]');
    await expect(phoneField).toHaveCSS('border-color', 'rgba(23, 22, 18, 0.12)');
    await expect(phoneField).toHaveCSS('border-radius', '12px');
    await expect(phoneField).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\.04\) 0px 1px 2px/);
    await expect(dialog.getByRole('button', { name: 'Country code, India +91' })).toHaveCSS(
      'border-right-color',
      'rgba(23, 22, 18, 0.1)',
    );
    const otpControl = dialog.getByRole('button', { name: 'Get OTP', exact: true });
    const clippedPaint = await otpControl.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const clipped: string[] = [];
      for (let ancestor = button.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.overflowX === 'visible') continue;
        const clip = ancestor.getBoundingClientRect();
        if (bounds.left - 2 < clip.left || bounds.right + 2 > clip.right) {
          clipped.push(ancestor.tagName);
        }
      }
      return clipped;
    });
    expect(clippedPaint, 'OTP border and shadow have room outside the button').toEqual([]);
    const browsingTab = dialog.getByRole('tab', { name: "I'm browsing" });
    await page.keyboard.press('Tab');
    await browsingTab.focus();
    await expect(browsingTab).toHaveCSS('box-shadow', /inset/);
    if (width < 768) {
      const welcome = dialog.getByRole('heading', { name: 'Welcome to Tickif' });
      const welcomeBox = await welcome.boundingBox();
      const closeButton = dialog.getByRole('button', { name: 'Close', exact: true });
      // Measure the touch target after the dialog's opening scale animation settles.
      await expect
        .poll(async () => Math.round((await closeButton.boundingBox())!.height))
        .toBeGreaterThanOrEqual(44);
      const closeBox = await closeButton.boundingBox();
      expect(closeBox!.y).toBeLessThanOrEqual(welcomeBox!.y);
      await expect(
        dialog.getByText('Keep your favourite homes close.', { exact: true }),
      ).toBeVisible();
      const trustBox = await dialog
        .getByText('Discover real homes and their designers', { exact: true })
        .boundingBox();
      expect(trustBox!.y).toBeGreaterThan(welcomeBox!.y + welcomeBox!.height);
      const otpButton = dialog.getByRole('button', { name: 'Get OTP', exact: true });
      const buttonBox = await otpButton.boundingBox();
      const agreementBox = await agreement.boundingBox();
      expect(agreementBox!.y - (buttonBox!.y + buttonBox!.height)).toBeLessThanOrEqual(32);
      for (const control of [
        dialog.getByRole('tab', { name: "I'm browsing" }),
        dialog.getByRole('textbox', { name: 'Phone number' }),
        otpButton,
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }

    await dialog.getByRole('tab', { name: "I'm a designer" }).click();
    await expect(dialog.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
    const emailField = dialog.getByRole('textbox', { name: 'Email', exact: true });
    await emailField.blur();
    await expect(emailField).toHaveCSS('border-color', 'rgba(23, 22, 18, 0.12)');
    await emailField.focus();
    await expect(emailField).toHaveCSS('border-color', 'rgb(30, 122, 85)');
    await expect(agreement).toBeInViewport({ ratio: 1 });
    expect(
      await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole('tab', { name: "I'm browsing" }).click();
    await expect(dialog.getByRole('textbox', { name: 'Email', exact: true })).toBeHidden();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await main.boundingBox())!.width).toBeCloseTo(before!.width, 0);
  });
}

test('public sign-in opens over the current page and closes back to it', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Log in', exact: true }).click();

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

test('a short mobile viewport scrolls only the dialog and preserves the underlying page position', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto('/company/privacy');
  await page.evaluate(() => window.scrollTo(0, 300));
  const scrollY = await page.evaluate(() => window.scrollY);
  const before = await page.locator('main').boundingBox();
  // Exercise navigation from a scrolled document without scrolling its header into view.
  await page
    .getByRole('link', { name: 'Sign in', exact: true })
    .evaluate((link: HTMLAnchorElement) => link.click());
  const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect((await page.locator('main').boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(page.getByTestId('scroll-signup-gate')).toHaveCount(0);
  await dialog.getByRole('tab', { name: "I'm a designer" }).click();
  await dialog.getByText(/By continuing you agree/).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL('/company/privacy');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test('designer sign-in opens in designer mode over the current page', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'List your projects', exact: true })
    .click();

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
  await page.goto('/designers');
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
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
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
    await expect(page.getByRole('heading', { name: 'You’re in — welcome!' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page).toHaveURL(/\/home\?feed=custom$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await removeSyntheticUserByPhone(phoneNumber);
  }
});
