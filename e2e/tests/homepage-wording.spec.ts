import { expect, test } from '@playwright/test';

test.use({ video: 'on' });

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`homepage wording and discovery controls at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/Tickif/i);
    const heading = page.getByRole('heading', {
      level: 1,
      name: 'Inspire from real homes you’ll love.',
      exact: true,
    });
    const eyebrow = page.getByText('Architecture · Construction · Interior.', { exact: true });
    const search = page.getByRole('searchbox', { name: 'Search homes' });
    await expect(heading).toBeVisible();
    await expect(eyebrow).toBeVisible();
    await expect(search).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const headingBounds = await heading.boundingBox();
    const searchBounds = await search.boundingBox();
    expect(headingBounds).not.toBeNull();
    expect(searchBounds).not.toBeNull();
    expect(headingBounds!.y + headingBounds!.height).toBeLessThan(searchBounds!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: false });

    await search.fill('kitchen');
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(page).toHaveURL(/\?q=kitchen$/);
    await expect(page.getByRole('heading', { name: 'Results for “kitchen”' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search homes' })).toHaveValue('kitchen');
    await page.screenshot({ path: testInfo.outputPath('search-results.png'), fullPage: false });

    await page.goto('/');
    const shortcut = page.getByRole('link', { name: /^Projects in / }).first();
    await expect(shortcut).toBeVisible();
    const shortcutHref = await shortcut.getAttribute('href');
    expect(shortcutHref).toMatch(/^\/\?city=/);
    await shortcut.click();
    await expect(page).toHaveURL(shortcutHref!);
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });
}
