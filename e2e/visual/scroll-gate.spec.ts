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
  test(`scroll-revealed login fades out when the reader scrolls back at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/scroll-gate-evidence');
    const gate = page.getByTestId('scroll-signup-gate');
    await expect(gate).toBeAttached();
    const before = await page.locator('main').boundingBox();
    await page.evaluate(() => window.scrollTo(0, 2_000));
    await expect(gate).toHaveAttribute('aria-hidden', 'false');
    const after = await page.locator('main').boundingBox();
    expect(Math.abs(after!.width - before!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
    const dialog = page.getByRole('dialog', { name: 'Sign in required' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const backgroundAction = page.getByRole('button', { name: 'Background action' });
    const openedY = await page.evaluate(() => window.scrollY);

    // The page keeps scrolling underneath the pinned card.
    await page.mouse.move(4, viewport.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(openedY);
    await settleScroll(page);
    await expect(gate).toHaveAttribute('data-scroll-progress', '1.000');

    await page.mouse.wheel(0, -300);
    await expect(gate).toHaveAttribute('aria-hidden', 'true');
    expect(Number(await gate.getAttribute('data-scroll-progress'))).toBeLessThan(1);
    expect(
      Number(await page.getByTestId('scroll-signup-backdrop').evaluate((e) => e.style.opacity)),
    ).toBeLessThan(0.6);
    await expect.poll(() => backgroundAction.evaluate((e) => e.closest('[inert]'))).toBeNull();

    await page.mouse.wheel(0, 300);
    await expect(gate).toHaveAttribute('aria-hidden', 'false');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const pinnedY = await page.evaluate(() => window.scrollY);

    if (viewport.height === 480) {
      await dialog.getByRole('tab', { name: "I'm a designer" }).click();
      const scroller = gate.locator('[data-slot="scroll-gate-scroller"]');
      await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.scrollY)).toBe(pinnedY);
      await expect(dialog.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
    }

    await page.keyboard.press('Escape');
    await expect(gate).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(pinnedY);
    await page.mouse.move(4, viewport.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(pinnedY);
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
