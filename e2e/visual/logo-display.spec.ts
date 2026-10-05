import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`studio logo proportions and recovery at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    // The harness has no server auth dependency; satisfy the optimistic path gate.
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: 'component-evidence-only',
        url: 'http://localhost:3108',
      },
    ]);
    await page.goto('/logo-display-evidence');
    await expect(page).toHaveTitle('Tickif');
    await expect(page.getByRole('heading', { name: 'Studio logo display' })).toBeVisible();
    await expect(page.locator('nextjs-portal [data-nextjs-dialog-overlay]')).toHaveCount(0);
    for (const label of [
      'Saved square crop',
      'Legacy wide logo',
      'Legacy tall logo',
      'Transparent logo',
    ]) {
      const region = page.getByRole('region', { name: label, exact: true });
      await expect(region.getByRole('img')).toHaveCount(3);
      for (const image of await region.getByRole('img').all()) {
        await expect
          .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0);
        await expect(image).toHaveCSS('object-fit', 'contain');
        const dimensions = await image.evaluate((element) => ({
          width: (element as HTMLImageElement).width,
          height: (element as HTMLImageElement).height,
        }));
        expect(dimensions.width).toBe(dimensions.height);
      }
    }
    for (const label of ['Missing logo', 'Broken logo']) {
      const region = page.getByRole('region', { name: label, exact: true });
      await expect(region.getByRole('img')).toHaveCount(0);
      await expect(region.getByText('ST', { exact: true })).toHaveCount(3);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('logo-shapes-and-fallbacks.png'),
      fullPage: true,
    });
    await testInfo.attach('logo-shapes-and-fallbacks', {
      path: testInfo.outputPath('logo-shapes-and-fallbacks.png'),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Replace broken logo', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Replacement logo' })).toBeVisible();
    await expect(page.getByText('Replacement loaded', { exact: true })).toBeVisible();
    await testInfo.attach('replacement-recovers', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Use broken logo', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Replacement logo' })).toHaveCount(0);
    await expect(page.getByText('Initials fallback', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
