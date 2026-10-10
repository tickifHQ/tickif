import { expect, test } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

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
  test(`explicit login locks the page and restores scrolling at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/company/privacy');
    await page.evaluate(() => window.scrollTo(0, 300));
    const lockedY = await page.evaluate(() => window.scrollY);
    const before = await page.locator('main').boundingBox();
    await page
      .getByRole('link', { name: 'Sign in', exact: true })
      .evaluate((link: HTMLAnchorElement) => link.click());
    const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
    await expect(dialog).toBeVisible();
    const after = await page.locator('main').boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    const backdrop = await page.locator('[data-slot="dialog-overlay"]').boundingBox();
    expect(Math.abs(backdrop!.width - viewport.width)).toBeLessThanOrEqual(1);
    await page.mouse.move(4, viewport.height / 2);
    await page.mouse.wheel(0, -300);
    await settleScroll(page);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedY);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(lockedY);
  });
}
