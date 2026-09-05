import { expect, test } from '@playwright/test';

test('review moderation requires a session and retains the selected queue on login', async ({
  page,
}) => {
  await page.goto('/review-moderation?status=disputed&page=2');
  await expect(page).toHaveURL(
    '/login?callbackURL=%2Freview-moderation%3Fstatus%3Ddisputed%26page%3D2',
  );
  await expect(page.getByRole('heading', { name: 'Login to continue' })).toBeVisible();
});
