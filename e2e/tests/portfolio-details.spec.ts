import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

test.use({ video: 'on' });

test('portfolio details persist from editor to public studio on desktop and mobile', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  await assertTestDb();
  const suffix = randomUUID();
  const user = await makeUser({
    name: 'Portfolio Owner',
    email: `details-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: 'Meadow Studio', slug: `meadow-${suffix}` });
  const profile = await makeDesigner({
    userId: user.id,
    orgId: organization.id,
    displayName: 'Meadow Studio',
    entityType: 'company',
    status: 'active',
    bio: 'Thoughtful homes designed around everyday life.',
    foundedYear: null,
    yearsExperience: 0,
    customCities: ['Mumbai', 'Pune', 'Nashik'],
  });
  const logoKey = `originals/logos/${profile.id}/logo.png`;
  const coverKey = `originals/portfolio-covers/${profile.id}/cover.jpg`;
  const aspectLogoKeys: string[] = [];
  const slug = `meadow-${suffix}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    for (const asset of [
      { key: logoKey, file: 'email/tickif-mark.png', contentType: 'image/png' },
      { key: coverKey, file: 'home-hero/neutral-living-room.jpg', contentType: 'image/jpeg' },
    ]) {
      await putObject({
        key: asset.key,
        body: await readFile(
          resolve(import.meta.dirname, '../../apps/web/public/images', asset.file),
        ),
        contentType: asset.contentType,
      });
    }
    await db
      .update(schema.designerProfile)
      .set({ logoImageId: logoKey })
      .where(eq(schema.designerProfile.id, profile.id));
    await db.insert(schema.designerPortfolio).values({
      profileId: profile.id,
      portfolioSlug: slug,
      tagline: 'Space to feel at home',
      heroImageId: coverKey,
      publicLinkEnabled: true,
    });
    await signInPhone(context, user.phoneNumber);
    expect(
      (
        await context.request.put(`${apiUrl}/api/orgs/context`, {
          headers: { origin: webUrl },
          data: { kind: 'organization', organizationId: organization.id },
        })
      ).status(),
    ).toBe(200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/designer/profile');
    await page.getByLabel('Founded year').fill(String(new Date().getUTCFullYear() - 8));
    await page.getByLabel('Number of offices').fill('2');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Number of offices')).toHaveValue('2');
    await page.getByLabel('Number of offices').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('portfolio-details-editor-desktop.png'),
      animations: 'disabled',
    });
    const response = await context.request.get(`${apiUrl}/api/portfolios/${slug}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      stats: { yearsExperience: 8, officeCount: 2, cityPresenceCount: 3, google: null },
    });
    await page.goto('/designer/portfolio');
    const previewStats = page.getByRole('group', { name: 'Portfolio preview statistics' });
    await expect(previewStats.getByText('8', { exact: true })).toBeVisible();
    await expect(previewStats.getByText('Years experience')).toBeVisible();
    await expect(previewStats.getByText('0', { exact: true })).toBeVisible();
    await expect(previewStats.getByText('Published projects')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('portfolio-preview-statistics.png') });
    await page.goto(`/d/${slug}`);
    const hero = page.getByRole('region', { name: 'Portfolio hero' });
    await expect(page.locator('.profile-navigation')).not.toContainText('Meadow Studio');
    await expect(hero.getByRole('heading', { name: 'Meadow Studio' })).toBeVisible();
    await expect(hero.locator('.profile-card-name')).toHaveText('Selected work');
    await expect(hero.getByText('Established', { exact: true })).toBeVisible();
    await expect(hero.getByText('8 years experience', { exact: true })).toBeVisible();
    await expect(
      hero.getByLabel(String(new Date().getUTCFullYear() - 8), { exact: true }),
    ).toBeVisible();
    await expect(hero.getByText('Offices', { exact: true })).toBeVisible();
    await expect(hero.getByLabel('2', { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('portfolio-details-public-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(hero.getByText('Offices', { exact: true })).toBeVisible();
    await expect(hero.getByLabel('2', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('portfolio-details-public-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto('/designer/profile');
    await page.getByLabel('Number of offices').clear();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.goto(`/d/${slug}`);
    await expect(page.getByText('Offices', { exact: true })).toHaveCount(0);
    // Legacy uploads can be rectangular even though the current crop editor
    // saves squares. Exercise real raster dimensions through each shared frame.
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const shape of ['wide', 'tall']) {
      const key = `originals/logos/${profile.id}/${shape}.png`;
      aspectLogoKeys.push(key);
      await putObject({
        key,
        body: await readFile(resolve(import.meta.dirname, `../fixtures/${shape}-logo.png`)),
        contentType: 'image/png',
      });
      await db
        .update(schema.designerProfile)
        .set({ logoImageId: key })
        .where(eq(schema.designerProfile.id, profile.id));
      for (const route of ['/designer/dashboard', '/designer/portfolio', `/d/${slug}`]) {
        await page.goto(route);
        const matching = page.locator(`img[src*="${shape}.png"]`);
        await expect.poll(() => matching.count()).toBeGreaterThan(0);
        for (const image of await matching.all()) {
          await expect
            .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
            .toBe(shape === 'wide' ? 400 : 100);
          await expect(image).toHaveCSS('object-fit', 'contain');
          const rendered = await image.evaluate((element: HTMLImageElement) => ({
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
            transform: getComputedStyle(element).transform,
          }));
          expect(rendered.width).toBeCloseTo(rendered.height, 1);
          expect(rendered.transform).not.toBe('none');
        }
        await page.screenshot({
          path: testInfo.outputPath(`${shape}-logos-${route.split('/').at(-1)}.png`),
        });
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await deleteObject(logoKey);
    await deleteObject(coverKey);
    for (const key of aspectLogoKeys) await deleteObject(key);
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
