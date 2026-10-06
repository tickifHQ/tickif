import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeOrganization,
  makeProject,
  makeTaxonomy,
  makeUser,
} from '@repo/db/testing';
import { deleteObject, putObject } from '@repo/storage';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

/**
 * E-278: designer-facing surfaces must only expose a public portfolio URL when
 * the backend says the portfolio is genuinely live (`publiclyVisible`). These
 * journeys seed real profiles in each publication state and drive the actual
 * dashboard + portfolio-settings UI, then assert the public `/d/{slug}` route
 * agrees (unpublished stays a hard 404).
 *
 * Related, deliberately NOT re-tested here:
 * - Individual onboarding + completion and deferred recovery are
 *   already covered end-to-end in authentication.spec.ts.
 * - The publish-on-hero backend engine and public 404 gate are owned by the
 *   portfolio publication work; we only assert the frontend honours their state.
 */

const headers = { origin: webUrl };

async function selectOrganization(context: BrowserContext, organizationId: string) {
  const response = await context.request.put(`${apiUrl}/api/orgs/context`, {
    headers,
    data: { kind: 'organization', organizationId },
  });
  expect(response.status()).toBe(200);
}

type SeedOptions = {
  status: 'draft' | 'active';
  publicLinkEnabled: boolean;
  logo: boolean;
  bio: boolean;
  tagline: boolean;
  heroCover: boolean;
};

test.describe('E-278 portfolio publication readiness', () => {
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  test.afterAll(async () => {
    await assertTestDb();
    if (organizationIds.length > 0) {
      await db.delete(schema.organization).where(eq(schema.organization.id, organizationIds[0]!));
      for (const id of organizationIds.slice(1)) {
        await db.delete(schema.organization).where(eq(schema.organization.id, id));
      }
    }
    for (const id of userIds) {
      await db.delete(schema.user).where(eq(schema.user.id, id));
    }
  });

  async function seedDesigner(label: string, options: SeedOptions) {
    const suffix = randomUUID();
    const phoneNumber = `+9193${randomInt(10_000_000, 99_999_999)}`;
    const user = await makeUser({
      id: `e278-${label}-${suffix}`,
      name: `E278 ${label}`,
      email: `e278-${label}-${suffix}@example.test`,
      phoneNumber,
      phoneNumberVerified: true,
      role: 'designer',
      status: 'active',
    });
    userIds.push(user.id);

    const organization = await makeOrganization({
      id: `e278-${label}-${suffix}`,
      name: `E278 ${label} Studio`,
    });
    organizationIds.push(organization.id);

    const profile = await makeDesigner({
      userId: user.id,
      orgId: organization.id,
      displayName: organization.name,
      status: options.status,
      bio: options.bio ? `${label} studio biography for real homes` : null,
      logoImageId: options.logo ? `originals/logos/${label}-${suffix}/logo.png` : null,
    });

    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });

    const portfolioSlug = `${label.toLowerCase()}-${suffix}`;
    await db.insert(schema.designerPortfolio).values({
      profileId: profile.id,
      portfolioSlug,
      tagline: options.tagline ? `${label} designs with care` : null,
      heroImageId: options.heroCover ? `originals/portfolio-covers/${profile.id}/cover.jpg` : null,
      publicLinkEnabled: options.publicLinkEnabled,
    });

    return { user, organization, profile, portfolioSlug };
  }

  async function completeDashboardSetup(seed: Awaited<ReturnType<typeof seedDesigner>>) {
    const city = await makeTaxonomy({ kind: 'city', label: 'Chennai' });

    await Promise.all([
      db.insert(schema.account).values({
        id: randomUUID(),
        accountId: seed.user.email,
        providerId: 'google',
        userId: seed.user.id,
      }),
      db
        .insert(schema.designerProfileFootprint)
        .values({ profileId: seed.profile.id, taxonomyId: city.id }),
      db
        .update(schema.designerProfile)
        .set({ address: 'Adyar, Chennai' })
        .where(eq(schema.designerProfile.id, seed.profile.id)),
    ]);

    return makeProject({
      designerId: seed.profile.id,
      title: 'Calm Chennai Home',
      status: 'published',
      citySlug: 'chennai',
    });
  }

  test('custom cities can be typed, saved, reloaded, and removed on desktop and mobile', async ({
    page,
    context,
  }, testInfo) => {
    await assertTestDb();
    const seed = await seedDesigner('custom-cities', {
      status: 'active',
      publicLinkEnabled: true,
      logo: true,
      bio: true,
      tagline: true,
      heroCover: true,
    });
    await signInPhone(context, seed.user.phoneNumber);
    await selectOrganization(context, seed.organization.id);
    await page.goto('/designer/profile');
    await expect(page).toHaveTitle('Edit profile · Tickif');
    await expect(page.getByRole('heading', { name: 'Edit your profile' })).toBeVisible();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cities = page.getByRole('button', { name: /^Cities:/ });
    await cities.click();
    await page.getByRole('menuitemcheckbox', { name: 'Mumbai', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Add a custom city' }).click();
    const input = page.getByRole('textbox', { name: 'Add a custom city' });
    // M must remain in the text input rather than activate Mumbai's menu typeahead.
    await input.pressSequentially('Mapusa', { delay: 50 });
    await expect(input).toHaveValue('Mapusa');
    await expect(input).toBeFocused();
    await input.press('Enter');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Mapusa', exact: true })).toBeChecked();
    // Adding a selected row must not push the still-focused entry below the
    // scrollable menu's visible edge.
    const inputBounds = await input.boundingBox();
    const menuBounds = await page.getByRole('menu').boundingBox();
    expect(inputBounds).not.toBeNull();
    expect(menuBounds).not.toBeNull();
    expect(inputBounds!.y + inputBounds!.height).toBeLessThanOrEqual(
      menuBounds!.y + menuBounds!.height,
    );
    await page.screenshot({
      path: testInfo.outputPath('custom-cities-desktop.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(cities).toContainText('Mapusa');
    const published = await context.request.get(`${apiUrl}/api/portfolios/${seed.portfolioSlug}`);
    expect(published.ok()).toBeTruthy();
    expect(await published.json()).toMatchObject({
      cities: expect.arrayContaining(['Mumbai', 'Mapusa']),
      stats: { cityPresenceCount: 2 },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await cities.click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Mapusa', exact: true })).toBeChecked();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('custom-cities-mobile.png'),
      animations: 'disabled',
    });
    await page.getByRole('menuitemcheckbox', { name: 'Mapusa', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(cities).not.toContainText('Mapusa');
    expect(errors).toEqual([]);
  });

  test('an incomplete portfolio never exposes an actionable public URL (state D)', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({ baseURL: webUrl });
    try {
      // Legacy active profile missing Hero fields must still never be publicly visible.
      const seed = await seedDesigner('incomplete', {
        status: 'active',
        publicLinkEnabled: true,
        logo: false,
        bio: false,
        tagline: false,
        heroCover: false,
      });
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      // Dashboard: no copyable public link or public slug is exposed.
      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: /copy link/i })).toHaveCount(0);
      await expect(page.getByText(seed.portfolioSlug)).toHaveCount(0);
      await expect(page.getByRole('progressbar', { name: 'Portfolio setup' })).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: testInfo.outputPath('dashboard-setup-desktop.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('dashboard-setup-mobile.png'),
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 1440, height: 1000 });

      // Portfolio settings: no "Open full", no "Copy link".
      await page.goto('/designer/portfolio');
      await expect(page.getByRole('link', { name: 'Open full' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);

      // Public route: hard 404 for the unpublished slug.
      const publicResponse = await context.request.get(
        `${apiUrl}/api/portfolios/${seed.portfolioSlug}`,
        {
          headers,
        },
      );
      expect(publicResponse.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('a complete portfolio with the public link off stays private (state E)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: webUrl });
    try {
      // All hero fields present and active, but the public link is switched off.
      const seed = await seedDesigner('hidden', {
        status: 'active',
        publicLinkEnabled: false,
        logo: true,
        bio: true,
        tagline: true,
        heroCover: true,
      });
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      await page.goto('/designer/portfolio');
      await expect(page.getByRole('link', { name: 'Open full' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0);

      await page.goto('/designer/dashboard');
      await expect(page.getByRole('button', { name: /copy link/i })).toHaveCount(0);

      // Public route still 404s because the link is disabled.
      const publicResponse = await context.request.get(
        `${apiUrl}/api/portfolios/${seed.portfolioSlug}`,
        {
          headers,
        },
      );
      expect(publicResponse.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test('a published portfolio exposes the canonical URL everywhere and resolves publicly (state F + regression G)', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: webUrl,
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: testInfo.outputPath('portfolio-preview-videos') },
    });
    const storageKeys: string[] = [];
    try {
      // Complete + active + public link on -> publicly visible.
      const seed = await seedDesigner('published', {
        status: 'active',
        publicLinkEnabled: true,
        logo: true,
        bio: true,
        tagline: true,
        heroCover: true,
      });
      const project = await completeDashboardSetup(seed);
      const logoKey = `originals/logos/${seed.profile.id}/logo.png`;
      const coverKey = `originals/portfolio-covers/${seed.profile.id}/cover.jpg`;
      for (const asset of [
        { key: logoKey, file: 'email/tickif-mark.png', contentType: 'image/png' },
        { key: coverKey, file: 'home-hero/neutral-living-room.jpg', contentType: 'image/jpeg' },
      ]) {
        storageKeys.push(asset.key);
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
        .set({ yearsExperience: 7, projectCount: 12, logoImageId: logoKey })
        .where(eq(schema.designerProfile.id, seed.profile.id));
      const canonicalUrl = new URL(`/d/${seed.portfolioSlug}`, webUrl).toString();
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      // Portfolio settings: Open full points at the canonical saved URL.
      const editorErrors: string[] = [];
      page.on('pageerror', (error) => editorErrors.push(error.message));
      await page.goto('/designer/portfolio');
      const openFull = page.getByRole('link', { name: 'Open full' });
      await expect(openFull).toBeVisible();
      await expect(openFull).toHaveAttribute('href', canonicalUrl);
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();

      const editorAction = page.getByRole('link', { name: 'View portfolio', exact: true });
      await expect(editorAction).toBeInViewport();
      await expect(editorAction).toHaveAttribute('href', canonicalUrl);
      await expect(page).toHaveTitle(/Tickif/);
      const slugInput = page.getByPlaceholder('your-studio');
      await slugInput.fill('unsaved-preview-studio');
      for (const viewport of [
        { width: 1440, height: 1000, name: 'desktop' },
        { width: 390, height: 844, name: 'mobile' },
      ]) {
        await page.setViewportSize(viewport);
        await expect(editorAction).toBeInViewport();
        await expect
          .poll(() =>
            page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          )
          .toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`portfolio-editor-preview-${viewport.name}.png`),
          animations: 'disabled',
        });
        const popupPromise = page.waitForEvent('popup');
        await editorAction.click();
        const popup = await popupPromise;
        await expect(popup).toHaveURL(canonicalUrl);
        await expect(popup.getByRole('heading', { level: 1 })).toBeVisible();
        await popup.close();
        await expect(slugInput).toHaveValue('unsaved-preview-studio');
      }
      expect(editorErrors).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 1000 });

      // Dashboard: the share card shows and copies the same canonical URL.
      await page.goto('/designer/dashboard');
      await expect(page.getByTestId('post-setup-overview')).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Portfolio setup' })).toHaveCount(0);
      await expect(page.getByText('Setup complete', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Recent projects' })).toBeVisible();
      await expect(page.getByText(project.title, { exact: true })).toBeVisible();
      await expect(page.locator('[data-metric="total-projects"]')).toHaveText('1');
      await expect(page.getByRole('link', { name: 'Add project', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Add new project', exact: true }),
      ).toHaveAttribute('href', '/designer/projects/new');
      await expect(page.getByTestId('dashboard-workspace-illustration')).toBeVisible();
      const shareCard = page.getByTestId('dashboard-share-card');
      const viewPortfolio = shareCard.getByRole('link', { name: 'View portfolio', exact: true });
      await expect(viewPortfolio).toBeVisible();
      await expect(viewPortfolio).toHaveAttribute('href', canonicalUrl);
      await expect(viewPortfolio).toHaveAttribute('target', '_blank');
      await expect(viewPortfolio).toHaveAttribute('rel', 'noopener noreferrer');
      // Proof stats use profile counters, independently of the dashboard project total.
      await expect(
        shareCard
          .getByText('Years experience', { exact: true })
          .locator('..')
          .getByRole('definition'),
      ).toHaveText('7');
      await expect(
        shareCard.getByText('Projects', { exact: true }).locator('..').getByRole('definition'),
      ).toHaveText('12');
      await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible();
      await expect(page.getByText(seed.portfolioSlug).first()).toBeVisible();
      await page.getByRole('link', { name: 'Add new project', exact: true }).click();
      await expect(page).toHaveURL(/\/designer\/projects\/upload$/);
      await page.goto('/designer/dashboard');
      await expect(page.getByTestId('post-setup-overview')).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      const shareImages = [
        shareCard.getByAltText(`${seed.organization.name} logo`, { exact: true }),
        shareCard.getByAltText(`${seed.organization.name} portfolio cover`, { exact: true }),
      ];
      for (const image of shareImages) {
        await expect(image).toBeVisible();
        await expect
          .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
          .toBeGreaterThan(0);
      }
      await page.screenshot({
        path: testInfo.outputPath('dashboard-overview-desktop.png'),
        animations: 'disabled',
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      await expect(page.getByTestId('post-setup-overview')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('dashboard-overview-mobile.png'),
        animations: 'disabled',
        fullPage: true,
      });

      // The workspace has an inner scroller, so a document full-page capture
      // alone does not reveal the mobile share card below the recent projects.
      await shareCard.scrollIntoViewIfNeeded();
      for (const image of shareImages) {
        await expect(image).toBeVisible();
        await expect
          .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
          .toBeGreaterThan(0);
      }
      await expect(viewPortfolio).toBeInViewport();
      await expect(
        shareCard.getByRole('button', { name: 'Copy link', exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath('dashboard-share-card-mobile.png'),
        animations: 'disabled',
      });

      // Regression G: the canonical URL is the real slug — never a placeholder.
      expect(canonicalUrl).not.toContain('/d/studio');
      expect(canonicalUrl).not.toContain('/d/your-studio');

      // Public route resolves (200) for the published slug.
      const publicResponse = await context.request.get(
        `${apiUrl}/api/portfolios/${seed.portfolioSlug}`,
        {
          headers,
        },
      );
      expect(publicResponse.status()).toBe(200);

      // The public page itself renders (not a 404).
      const publicPage = await page.goto(canonicalUrl);
      expect(publicPage?.status()).toBe(200);
    } finally {
      await Promise.all([context.close(), ...storageKeys.map((key) => deleteObject(key))]);
    }
  });

  test('a saved experience center appears on the published portfolio and remains mobile-safe', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: webUrl,
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const seed = await seedDesigner('experience-centers', {
        status: 'active',
        publicLinkEnabled: true,
        logo: true,
        bio: true,
        tagline: true,
        heroCover: true,
      });
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();

      await page.goto('/designer/portfolio');
      await page
        .getByRole('heading', { name: 'Experience Centers' })
        .locator('xpath=ancestor::button')
        .click();
      await page.getByRole('button', { name: 'Add experience center' }).click();
      await page.getByLabel('Name').fill('Whitefield Experience Center');
      await page.getByLabel('Address').fill('12, 1st Main Road, Whitefield');
      await page.getByLabel('City').fill('Bengaluru');
      await page.getByLabel('State', { exact: true }).selectOption('Karnataka');
      await page.getByLabel('Postal code (optional)').fill('560066');
      await page.getByLabel('Phone (optional)').fill('+91 99946-45911');
      await page
        .getByLabel('Google Maps link (optional)')
        .fill('https://maps.google.com/?q=Whitefield');
      await page.getByRole('button', { name: 'Add center' }).click();
      await page.getByRole('button', { name: 'Add experience center' }).click();
      await page.getByLabel('Name').fill('Powai Studio');
      await page.getByLabel('Address').fill('4, Hiranandani Gardens, Powai');
      await page.getByLabel('City').fill('Mumbai');
      await page.getByLabel('State', { exact: true }).selectOption('Maharashtra');
      await page.getByRole('button', { name: 'Add center' }).click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();

      await page.goto(`/d/${seed.portfolioSlug}`);
      const centers = page.getByRole('region', { name: 'Experience centers' });
      await expect(centers).toBeVisible();
      await expect(
        centers.getByRole('heading', { name: 'Whitefield Experience Center' }),
      ).toBeVisible();
      await expect(centers.getByRole('heading', { name: 'Powai Studio' })).toBeVisible();
      await expect(centers.getByText('12, 1st Main Road, Whitefield')).toBeVisible();
      await expect(centers.getByText('Bengaluru, Karnataka · 560066')).toBeVisible();
      await expect(centers.getByText('Mumbai, Maharashtra')).toBeVisible();
      await expect(centers.getByRole('link', { name: '+91 99946-45911' })).toHaveAttribute(
        'href',
        'tel:+919994645911',
      );
      await expect(centers.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
        'rel',
        'noopener noreferrer nofollow',
      );
      await centers.screenshot({
        path: testInfo.outputPath('experience-centers-desktop.png'),
        animations: 'disabled',
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(centers).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await centers.screenshot({
        path: testInfo.outputPath('experience-centers-mobile.png'),
        animations: 'disabled',
      });
    } finally {
      await context.close();
    }
  });

  test('uploading the final required cover publishes the portfolio and renders responsively', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      baseURL: webUrl,
      permissions: ['clipboard-read', 'clipboard-write'],
      recordVideo: { dir: testInfo.outputPath('cover-video'), size: { width: 1440, height: 1000 } },
    });
    let releaseDelayedUpload: (() => void) | undefined;
    try {
      const seed = await seedDesigner('cover-upload', {
        status: 'draft',
        publicLinkEnabled: true,
        logo: true,
        bio: true,
        tagline: true,
        heroCover: false,
      });
      // Use an owned, real image so visual checks cannot pass with a broken logo.
      const logoKey = `originals/logos/${seed.profile.id}/logo.png`;
      await putObject({
        key: logoKey,
        body: await readFile(
          resolve(import.meta.dirname, '../../apps/web/public/images/email/tickif-mark.png'),
        ),
        contentType: 'image/png',
      });
      await db
        .update(schema.designerProfile)
        .set({ logoImageId: logoKey })
        .where(eq(schema.designerProfile.id, seed.profile.id));
      await signInPhone(context, seed.user.phoneNumber);
      await selectOrganization(context, seed.organization.id);
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto('/designer/dashboard');
      await expect(page.getByTestId('dashboard-preview-logo')).toBeVisible();
      await expect(page.getByAltText(`${seed.organization.name} portfolio cover`)).toHaveCount(0);
      await page.getByTestId('dashboard-share-card').screenshot({
        path: testInfo.outputPath('dashboard-gradient-fallback.png'),
      });

      await page.goto('/designer/portfolio');
      await expect(page.getByRole('button', { name: 'Upload portfolio cover' })).toBeVisible();
      const coverFile = resolve(
        import.meta.dirname,
        '../../apps/web/public/images/home-hero/neutral-living-room.jpg',
      );
      await page.getByLabel('Portfolio cover file').setInputFiles(coverFile);
      const cropDialog = page.getByRole('dialog', { name: 'Adjust portfolio cover' });
      await expect(
        cropDialog.getByRole('button', { name: 'Save cover', exact: true }),
      ).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath('cover-crop-desktop.png') });
      await cropDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Upload portfolio cover' })).toBeVisible();
      await page
        .getByLabel('Portfolio cover file')
        .setInputFiles(
          resolve(
            import.meta.dirname,
            '../../apps/web/public/images/home-hero/neutral-living-room.jpg',
          ),
        );
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(cropDialog).toBeVisible();
      await cropDialog.getByRole('slider', { name: 'Cover zoom' }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.screenshot({ path: testInfo.outputPath('cover-crop-mobile.png') });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await cropDialog.getByRole('button', { name: 'Save cover', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Replace portfolio cover' })).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.getByRole('link', { name: 'Open full' })).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });

      const savedCover = await page
        .getByAltText('Portfolio cover', { exact: true })
        .getAttribute('src');
      await page.getByLabel('Portfolio cover file').setInputFiles(coverFile);
      await expect(cropDialog).toBeVisible();
      await cropDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByAltText('Portfolio cover', { exact: true })).toHaveAttribute(
        'src',
        savedCover!,
      );
      await page.getByLabel('Portfolio cover file').setInputFiles(coverFile);
      await cropDialog.getByRole('slider', { name: 'Cover zoom' }).focus();
      await page.keyboard.press('End');
      await page.route('**/api/profiles/me/portfolio/cover/upload', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Cover storage unavailable' } }),
        }),
      );
      await cropDialog.getByRole('button', { name: 'Save cover', exact: true }).click();
      await expect(cropDialog.getByRole('alert')).toContainText('Cover storage unavailable');
      await expect(page.getByAltText('Portfolio cover', { exact: true })).toHaveAttribute(
        'src',
        savedCover!,
      );
      await page.screenshot({ path: testInfo.outputPath('cover-retry-mobile.png') });
      await page.unroute('**/api/profiles/me/portfolio/cover/upload');
      let releaseUpload!: () => void;
      const uploadHold = new Promise<void>((resolve) => {
        releaseUpload = resolve;
        releaseDelayedUpload = resolve;
      });
      await page.route('**/api/profiles/me/portfolio/cover/upload', async (route) => {
        await uploadHold;
        await route.continue();
      });
      await cropDialog.getByRole('button', { name: 'Save cover', exact: true }).click();
      const cropSurface = cropDialog.getByTestId('cover-crop-surface');
      await expect(cropSurface).toHaveAttribute('inert', '');
      const cropImage = cropDialog.getByAltText('Portfolio cover being adjusted');
      const lockedTransform = await cropImage.evaluate((image) => image.style.transform);
      const surfaceBox = await cropSurface.boundingBox();
      expect(surfaceBox).not.toBeNull();
      await page.mouse.move(surfaceBox!.x + 80, surfaceBox!.y + 80);
      await page.mouse.down();
      await page.mouse.move(surfaceBox!.x + 130, surfaceBox!.y + 110);
      await page.mouse.up();
      await page.mouse.wheel(0, -200);
      await page.keyboard.press('ArrowRight');
      await cropSurface
        .locator('[aria-disabled="true"]')
        .evaluate((element) =>
          element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
        );
      expect(await cropImage.evaluate((image) => image.style.transform)).toBe(lockedTransform);
      await page.screenshot({ path: testInfo.outputPath('cover-saving-mobile.png') });
      releaseUpload();
      await expect(cropDialog).toHaveCount(0);
      await page.unroute('**/api/profiles/me/portfolio/cover/upload');
      await page.reload();
      const persistedCover = page.getByAltText('Portfolio cover', { exact: true });
      await expect(persistedCover).toBeVisible();
      await expect
        .poll(() => persistedCover.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
      const dimensions = await persistedCover.evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
      expect(dimensions.width).toBeLessThanOrEqual(1920);
      expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9, 2);
      await page.setViewportSize({ width: 1440, height: 1000 });

      for (const surface of [
        {
          route: '/designer/portfolio',
          logo: 'portfolio-preview-logo',
          cover: 'Portfolio cover preview',
        },
        {
          route: '/designer/dashboard',
          logo: 'dashboard-preview-logo',
          cover: `${seed.organization.name} portfolio cover`,
        },
      ]) {
        await page.goto(surface.route);
        const logo = page.getByTestId(surface.logo);
        const cover = page.getByAltText(surface.cover, { exact: true });
        await expect(cover).toBeVisible();
        await expect
          .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0);
        await expect
          .poll(() => logo.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
          .toBeGreaterThan(0);
        for (const viewport of [
          { width: 1440, height: 1000 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport);
          // Settings deliberately reserves its side-by-side live preview for
          // desktop; on mobile the editing form uses the full screen width.
          if (surface.logo === 'portfolio-preview-logo' && viewport.width < 1024) {
            await expect(logo).toBeHidden();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: testInfo.outputPath('portfolio-settings-mobile.png') });
            continue;
          }
          await logo.scrollIntoViewIfNeeded();
          await expect(logo).toHaveCSS('border-top-width', '0px');
          // The overlapping top of the logo must win hit testing over the cover.
          expect(
            await logo.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return element.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + 8),
              );
            }),
          ).toBe(true);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`${surface.logo}-${viewport.width}.png`),
          });
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole('button', { name: 'Copy link', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      }
      expect(pageErrors).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 1000 });

      const publicUrl = `/d/${seed.portfolioSlug}`;
      await page.goto(publicUrl);
      await expect(page.getByRole('region', { name: 'Portfolio hero' })).toBeVisible();
      const portfolioCover = page.getByAltText(`${seed.organization.name} portfolio cover`);
      await expect(portfolioCover).toBeVisible();
      await expect(portfolioCover).toHaveAttribute('loading', 'eager');
      // This studio has no founding year or legacy experience, so omit the unknown value.
      await expect(page.getByText('Years experience')).toHaveCount(0);
      await expect(page.getByText('Projects', { exact: true })).toBeVisible();
      await expect(page.getByText('Cities present')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Send enquiry', exact: true }).first(),
      ).toBeVisible();

      const ownEnquire = page.getByRole('button', { name: 'Enquire', exact: true }).first();
      await expect(ownEnquire).toHaveAttribute('aria-disabled', 'true');
      await ownEnquire.hover();
      await expect(page.getByRole('tooltip')).toHaveText(
        "You can't enquire about your own studio.",
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('region', { name: 'Portfolio hero' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    } finally {
      releaseDelayedUpload?.();
      await context.close();
    }
  });
});
