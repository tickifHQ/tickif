import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeUser } from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { onboardDesignerResponseSchema } from '@repo/contracts';
import { signInPhone } from '../lib/auth';
import { apiUrl } from '../lib/environment';
import { makePublicPortfolio } from '../lib/public-portfolio';

// Browser plugin not available; repository Playwright exercises the real local stack.
// Flow: onboarding presence -> destination confirmation -> profile save/reload -> public links.
test.use({ video: 'on' });

test('social profile confirmations match saved public links on desktop and mobile', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000);
  await assertTestDb();
  const suffix = randomUUID();
  const user = await makeUser({
    name: 'Social Studio Owner',
    email: `social-${suffix}@example.test`,
    phoneNumber: `+9193${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
    role: 'visitor',
    status: 'pending',
  });
  let orgId: string | undefined;
  let logoKey: string | undefined;
  let coverKey: string | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await signInPhone(context, user.phoneNumber);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/designer/onboarding');
    await page.getByRole('button', { name: /Interior company/i }).click();
    await page.getByLabel(/^Company name/).fill('Social Studio');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByText('Social links', { exact: true })).toBeVisible();
    await page.getByLabel('Instagram', { exact: true }).fill('@social.studio');
    await page.getByLabel('LinkedIn', { exact: true }).fill('/company/social-studio');
    await page.getByLabel('YouTube', { exact: true }).fill('@social-studio');
    const destinations = {
      Instagram: 'https://www.instagram.com/social.studio',
      LinkedIn: 'https://www.linkedin.com/company/social-studio',
      YouTube: 'https://www.youtube.com/@social-studio',
    };
    for (const [platform, href] of Object.entries(destinations)) {
      const link = page.getByRole('link', {
        name: `Open ${platform} profile (opens in a new tab)`,
      });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await page.screenshot({
      path: testInfo.outputPath('social-onboarding-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('YouTube', { exact: true }).fill('javascript:alert(1)');
    await expect(page.getByLabel('YouTube', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
    await expect(page.getByRole('link', { name: /Open YouTube profile/ })).toHaveCount(0);
    await page.getByLabel('YouTube', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('social-invalid-mobile.png'),
      animations: 'disabled',
    });
    await page.getByLabel('YouTube', { exact: true }).fill('@social-studio');
    await page.screenshot({
      path: testInfo.outputPath('social-onboarding-mobile.png'),
      animations: 'disabled',
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const submitted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/profiles/me'),
    );
    await page.getByRole('button', { name: 'Skip to Next step', exact: true }).click();
    const onboarded = onboardDesignerResponseSchema.parse(await (await submitted).json());
    orgId = onboarded.organization.id;
    const slug = `social-${suffix}`;
    // Public portfolios require a complete hero. Prepare real synthetic assets,
    // so the destination comparison exercises the existing publication gate.
    logoKey = `originals/logos/${onboarded.profile.id}/logo.png`;
    coverKey = `originals/portfolio-covers/${onboarded.profile.id}/cover.jpg`;
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
      .set({
        status: 'active',
        logoImageId: logoKey,
        bio: 'Thoughtful homes designed around everyday life.',
      })
      .where(eq(schema.designerProfile.id, onboarded.profile.id));
    const portfolio = await makePublicPortfolio({
      profileId: onboarded.profile.id,
      portfolioSlug: slug,
    });
    await db
      .update(schema.designerPortfolio)
      .set({ heroImageId: coverKey })
      .where(eq(schema.designerPortfolio.id, portfolio.id));
    await page.goto('/designer/profile');
    for (const [platform, href] of Object.entries(destinations)) {
      await expect(
        page.getByRole('link', { name: `Open ${platform} profile (opens in a new tab)` }),
      ).toHaveAttribute('href', href);
    }
    await page
      .getByLabel('Instagram', { exact: true })
      .fill('https://instagram.com/confirmed.studio');
    destinations.Instagram = 'https://instagram.com/confirmed.studio';
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Instagram', { exact: true })).toHaveValue(destinations.Instagram);
    await page.getByLabel('Instagram', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('social-profile-mobile.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: testInfo.outputPath('social-profile-desktop.png'),
      animations: 'disabled',
    });
    await page.goto('/designer/portfolio');
    await page.getByRole('heading', { name: 'Social links', exact: true }).click();
    for (const [platform, href] of Object.entries(destinations)) {
      await expect(
        page.getByRole('link', { name: `Open ${platform} profile (opens in a new tab)` }),
      ).toHaveAttribute('href', href);
    }
    await page.getByRole('textbox', { name: 'Instagram', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('social-portfolio-settings-desktop.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: 'Instagram', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('social-portfolio-settings-mobile.png'),
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    const persisted = await context.request.get(`${apiUrl}/api/portfolios/${slug}`);
    expect(persisted.status()).toBe(200);
    expect(await persisted.json()).toMatchObject({
      social: {
        instagramHandle: destinations.Instagram,
        linkedinHandle: '/company/social-studio',
        youtubeHandle: '@social-studio',
      },
    });
    await page.goto(`/d/${slug}`);
    for (const href of Object.values(destinations))
      await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
    await page.locator(`a[href="${destinations.Instagram}"]`).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('social-public-desktop.png'),
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  } finally {
    await assertTestDb();
    if (logoKey) await deleteObject(logoKey);
    if (coverKey) await deleteObject(coverKey);
    if (orgId) await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
  }
});
