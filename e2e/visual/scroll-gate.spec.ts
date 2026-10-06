import { expect, test } from '@playwright/test';

test('an oversized scroll sign-in card keeps its top and bottom reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.context().addCookies([
    {
      name: 'better-auth.session_token',
      value: 'component-evidence-only',
      url: 'http://localhost:3118',
    },
  ]);
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

  const bottom = dialog.getByText("By continuing you agree to Tickif's Terms & Privacy.", {
    exact: true,
  });
  await bottom.scrollIntoViewIfNeeded();
  await expect(bottom).toBeInViewport();
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await close.click();
  await expect(page.getByTestId('scroll-signup-gate')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Background action' })).toBeEnabled();
});
