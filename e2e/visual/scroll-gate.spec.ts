import { expect, test } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test.beforeEach(async ({ context }) => {
  // The temporary component route is intentionally outside the public registry.
  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: 'component-evidence-only',
      url: 'http://localhost:3118',
    },
  ]);
});

async function settleScroll(page: import('@playwright/test').Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 390, height: 480 },
]) {
  test(`scroll-revealed login locks the page until dismissal at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/scroll-gate-evidence');
    const gate = page.getByTestId('scroll-signup-gate');
    await expect(gate).toBeAttached();
    const before = await page.locator('main').boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(gate).toHaveAttribute('aria-hidden', 'false');
    const after = await page.locator('main').boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    const backdrop = await page.getByTestId('scroll-signup-backdrop').boundingBox();
    expect(Math.abs(backdrop!.width - viewport.width)).toBeLessThanOrEqual(1);
    const dialog = page.getByRole('dialog', { name: 'Sign in required' });
    const lockedY = await page.evaluate(() => window.scrollY);

    await page.mouse.move(4, viewport.height / 2);
    await page.mouse.wheel(0, -300);
    await settleScroll(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    if (viewport.height === 480) {
      await dialog.getByRole('tab', { name: "I'm a designer" }).click();
      const scroller = gate.locator('[data-slot="scroll-gate-scroller"]');
      await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
      await expect(dialog.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
    }

    await page.keyboard.press('Escape');
    await expect(gate).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    await page.mouse.move(4, viewport.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(lockedY);
  });
}

test('an oversized scroll sign-in card keeps its top and bottom reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/scroll-gate-evidence');
  await expect(page.getByTestId('scroll-signup-gate')).toHaveAttribute(
    'data-scroll-progress',
    '0.000',
  );
  await page.evaluate(() => window.scrollTo(0, 2_000));
  const dialog = page.getByRole('dialog', { name: 'Sign in required' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(0);

  const bottom = dialog.getByRole('link', { name: 'Privacy', exact: true });
  await bottom.scrollIntoViewIfNeeded();
  await expect(bottom).toBeInViewport();
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await close.click();
  await expect(page.getByTestId('scroll-signup-gate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Background action' })).toBeEnabled();
});
