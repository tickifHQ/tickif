import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import {
  assertTestDb,
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeUser,
} from '@repo/db/testing';
import { putObject, deleteObject } from '@repo/storage';
import { upsertSearchDocument, deleteSearchDocument } from '@repo/search';
import { signInPhone } from '../lib/auth';

async function labelContrast(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const [red = 0, green = 0, blue = 0] = (color.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

async function visibleSaveBox(button: Locator) {
  return button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    // CSS retains percentages/calc in computed clip-path. Measure its actual
    // hit-tested extent rather than mistaking the fixed layout box for the circle.
    let pixels = 0;
    for (; pixels < Math.ceil(rect.width); pixels++) {
      const target = document.elementFromPoint(rect.right - pixels - 0.5, rect.y + rect.height / 2);
      if (target?.closest('button') !== element) break;
    }
    const width = Math.min(pixels, rect.width);
    return { x: rect.right - width, width, height: rect.height };
  });
}

test('visitor home wires real activity, recommendations and retryable saves across viewports', async ({
  page,
  context,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await assertTestDb();
  const visitor = await makeUser({
    name: 'Visitor Home QA',
    role: 'visitor',
    status: 'active',
    phoneNumber: `+9197${randomInt(10_000_000, 99_999_999)}`,
    phoneNumberVerified: true,
  });
  const designer = await makeDesigner({
    status: 'active',
    logoImageId: 'logos/visitor-home-studio.svg',
  });
  const source = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Visitor home saved source',
    publishedAt: new Date(),
    citySlug: 'chennai',
    bhkSlug: '3-bhk',
    budgetBandSlug: 'upscale',
    scopeSlug: 'full-home',
  });
  const verifiedAt = new Date();
  await db.insert(schema.verificationApplication).values({
    organizationId: designer.orgId,
    status: 'verified',
    submittedAt: verifiedAt,
    reviewedAt: verifiedAt,
    approvedAt: verifiedAt,
    expiresAt: new Date(verifiedAt.getTime() + 86400000),
  });
  const similar = await makeProject({
    designerId: designer.id,
    status: 'published',
    title: 'Visitor home similar project',
    // Keep the saved source newest so the first-column error boundary is exercised.
    publishedAt: new Date(source.publishedAt!.getTime() - 1000),
    citySlug: 'chennai',
    bhkSlug: '3-bhk',
    budgetBandSlug: 'upscale',
    scopeSlug: 'full-home',
  });
  const coverKey = `e2e/visitor-home/${randomUUID()}.jpg`;
  const cover = await makeProjectImage({
    projectId: similar.id,
    originalKey: coverKey,
    status: 'ready',
    isLive: true,
    width: 1280,
    height: 960,
    derivatives: [{ variant: 'medium', format: 'jpeg', key: coverKey, width: 1280, height: 960 }],
  });
  await db
    .update(schema.project)
    .set({ coverImageId: cover.id })
    .where(eq(schema.project.id, similar.id));
  await db.insert(schema.enquiry).values({
    requesterId: visitor.id,
    designerProfileId: designer.id,
    organizationId: designer.orgId,
    referredProjectId: source.id,
    subject: 'Synthetic visitor enquiry',
    description: 'Local workflow QA only',
    budget: '10l-20l',
    status: 'responded',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await putObject({
      key: coverKey,
      contentType: 'image/jpeg',
      body: await readFile(
        new URL(
          '../../apps/web/public/images/home-hero/warm-pendant-living-room.jpg',
          import.meta.url,
        ),
      ),
    });
    const logo = await readFile(
      new URL('../../apps/web/public/images/landing/logo-mark.svg', import.meta.url),
      'utf8',
    );
    await page.route('**/logos/visitor-home-studio.svg*', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: logo }),
    );
    for (const project of [source, similar]) {
      await upsertSearchDocument('projects', {
        id: project.id,
        slug: project.slug,
        title: project.title,
        description: 'Visitor discovery fixture',
        designerId: designer.id,
        designerSlug: designer.slug,
        designerName: designer.displayName,
        citySlug: 'chennai',
        cityName: null,
        localitySlug: null,
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        scopeSlug: 'full-home',
        bhkSlug: '3-bhk',
        budgetBandSlug: project.budgetBandSlug!,
        sizeSqft: 1200,
        themes: [],
        materials: [],
        finishes: [],
        roomSlugs: [],
        roomLabels: [],
        tags: [],
        coverImageKey: project.id === similar.id ? coverKey : null,
        publishedAt: project.publishedAt!.getTime(),
        featuredAt: null,
        avgRating: 0,
        reviewCount: 0,
      });
    }
    await signInPhone(context, visitor.phoneNumber);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/home?feed=custom');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('link', { name: 'Saved 0', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enquiries 1 NEW', exact: true })).toBeVisible();
    await expect(page.getByText('Responded', { exact: true })).toBeVisible();
    const sourceCard = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: source.title, exact: true }) });
    const studioLogo = sourceCard.locator('img[src*="/logos/visitor-home-studio.svg"]');
    const verifiedTick = sourceCard.getByRole('img', { name: 'Verified studio', exact: true });
    await expect(verifiedTick).toBeVisible();
    await expect(verifiedTick).toHaveCSS('width', '14px');
    await expect(verifiedTick).toHaveCSS('height', '14px');
    await expect(verifiedTick).toHaveClass(/lucide-badge-check/);
    await sourceCard.hover();
    await expect(sourceCard.locator('svg.lucide-bookmark')).toBeVisible();
    await expect(sourceCard.locator('img[src*="bookmarks.svg"]')).toHaveCount(0);
    await expect(studioLogo).toBeVisible();
    await expect
      .poll(() => studioLogo.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await page.route(`**/api/saved-projects/${source.id}`, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } })
        : route.continue(),
    );
    const initialSave = sourceCard.getByRole('button', { name: 'Save project', exact: true });
    await expect(initialSave).toBeEnabled();
    await initialSave.hover({
      timeout: 10000,
      position: { x: (await initialSave.boundingBox())!.width - 16, y: 16 },
    });
    await expect(initialSave.getByText('Save', { exact: true })).toHaveCSS('opacity', '1');
    await initialSave.click({
      timeout: 10000,
      position: { x: (await initialSave.boundingBox())!.width - 16, y: 16 },
    });
    const failure = sourceCard.getByRole('status');
    await expect(failure).toHaveText('Could not update saved project. Please try again.');
    const failureBox = (await failure.boundingBox())!;
    expect(failureBox.x).toBeGreaterThanOrEqual(0);
    expect(failureBox.x + failureBox.width).toBeLessThanOrEqual(320);
    await expect(page.getByRole('link', { name: 'Saved 0', exact: true })).toBeVisible();
    await page.unroute(`**/api/saved-projects/${source.id}`);
    const homeRefreshRequests: string[] = [];
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === '/home' &&
        (request.isNavigationRequest() || request.headers().rsc === '1')
      ) {
        homeRefreshRequests.push(request.url());
      }
    });
    await page.getByRole('searchbox', { name: 'Search homes' }).fill('Unsubmitted draft');
    const saveButton = sourceCard.getByRole('button', { name: 'Save project', exact: true });
    await page.setViewportSize({ width: 1280, height: 844 });
    await saveButton.scrollIntoViewIfNeeded();
    await expect(saveButton).toBeEnabled();
    await page.mouse.move(0, 0);
    await expect(saveButton).toHaveCSS('opacity', '0');
    await expect(saveButton).toHaveCSS('pointer-events', 'none');
    await sourceCard.hover({ position: { x: 20, y: 20 } });
    await expect(saveButton).toHaveCSS('opacity', '1');
    await expect(saveButton.getByText('Save', { exact: true })).toHaveCSS('opacity', '0');
    const collapsed = await visibleSaveBox(saveButton);
    // Pixel hit-testing may round an antialiased circle edge by one pixel.
    expect(Math.abs(collapsed.width - 32)).toBeLessThanOrEqual(1);
    expect(collapsed.height).toBe(32);
    await expect(saveButton).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.94)');
    await expect(saveButton).toHaveCSS('transition-property', 'clip-path');
    await expect(saveButton).toHaveCSS('transition-duration', '0.2s');
    // The hidden portion of the full-width reveal must not block the project link.
    const layoutBox = (await saveButton.boundingBox())!;
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a') !== null, {
        x: layoutBox.x + 4,
        y: layoutBox.y + 16,
      }),
    ).toBe(true);
    await sourceCard.screenshot({ path: '/tmp/tickif-save-circle.png' });
    await saveButton.hover({
      position: { x: (await saveButton.boundingBox())!.width - 16, y: 16 },
    });
    await expect(saveButton.getByText('Save', { exact: true })).toHaveCSS('opacity', '1');
    const expanded = await visibleSaveBox(saveButton);
    expect(expanded.width).toBeGreaterThan(collapsed.width);
    expect((await saveButton.boundingBox())!.width).toBe(layoutBox.width);
    expect(expanded.x + expanded.width).toBeCloseTo(collapsed.x + collapsed.width, 0);
    await expect(saveButton).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.94)');
    await sourceCard.screenshot({ path: '/tmp/tickif-save-pill.png' });
    await page.mouse.move(0, 0);
    await expect(saveButton).toHaveCSS('opacity', '0');
    await saveButton.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(saveButton).toBeFocused();
    await expect(saveButton).toHaveCSS('opacity', '1');
    await expect(saveButton.getByText('Save', { exact: true })).toHaveCSS('opacity', '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(saveButton).toHaveCSS('transition-duration', '0s');
    await expect(saveButton.getByText('Save', { exact: true })).toHaveCSS('opacity', '1');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const scrollBeforeSave = await page.evaluate(() => window.scrollY);
    await saveButton.press('Enter');
    await expect(page.getByRole('link', { name: 'Saved 1', exact: true })).toBeVisible();
    expect(homeRefreshRequests).toEqual([]);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scrollBeforeSave, 0);
    await expect(page.getByRole('searchbox', { name: 'Search homes' })).toHaveValue(
      'Unsubmitted draft',
    );
    const suggestions = page.getByRole('region', { name: 'Based on your saved project' });
    // Saving must not insert a new recommendation row and move the current feed.
    await expect(suggestions).toHaveCount(0);
    await page.reload();
    const savedPill = sourceCard.getByRole('button', { name: 'Remove saved project', exact: true });
    await expect(savedPill).toBeEnabled();
    await page.mouse.move(0, 0);
    await expect(savedPill.getByText('Saved', { exact: true })).toBeVisible();
    await expect(savedPill.getByText('Unsave', { exact: true })).toBeHidden();
    const restingSaved = (await savedPill.boundingBox())!;
    expect(restingSaved.height).toBe(32);
    const imageBox = (await sourceCard
      .getByRole('img', {
        name: `${source.title} image unavailable`,
      })
      .boundingBox())!;
    expect(imageBox.x + imageBox.width - restingSaved.x - restingSaved.width).toBeCloseTo(10, 0);
    expect(restingSaved.y - imageBox.y).toBeCloseTo(10, 0);
    expect(
      await savedPill
        .locator('svg.lucide-bookmark-check')
        .evaluate((icon) => icon.getBoundingClientRect().width),
    ).toBe(14);
    await savedPill.hover();
    await expect(savedPill.getByText('Unsave', { exact: true })).toBeVisible();
    await expect(savedPill.locator('svg.lucide-bookmark-off')).toBeVisible();
    const hoveredSaved = (await savedPill.boundingBox())!;
    expect(hoveredSaved.x + hoveredSaved.width).toBeCloseTo(restingSaved.x + restingSaved.width, 0);
    expect(hoveredSaved.width).toBeGreaterThanOrEqual(restingSaved.width);
    await page.mouse.move(0, 0);
    await savedPill.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(savedPill).toBeFocused();
    await expect(savedPill.getByText('Unsave', { exact: true })).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    const touchContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      isMobile: true,
      storageState: await context.storageState(),
    });
    try {
      const touchPage = await touchContext.newPage();
      await touchPage.goto(new URL('/home?feed=custom', page.url()).href);
      const touchCard = touchPage
        .getByRole('article')
        .filter({ has: touchPage.getByRole('heading', { name: source.title, exact: true }) });
      const touchSaved = touchCard.getByRole('button', {
        name: 'Remove saved project',
        exact: true,
      });
      await expect(touchSaved).toBeEnabled();
      expect((await touchSaved.boundingBox())!.height).toBe(44);
      await expect(touchSaved.getByText('Saved', { exact: true })).toBeVisible();
      await touchSaved.tap();
      const touchSave = touchCard.getByRole('button', { name: 'Save project', exact: true });
      await expect(touchSave).toBeEnabled();
      await expect(touchSave).toHaveCSS('opacity', '1');
      await touchSave.tap();
      await expect(
        touchCard.getByRole('button', { name: 'Remove saved project', exact: true }),
      ).toBeEnabled();
    } finally {
      await touchContext.close();
    }
    await expect(
      suggestions.getByRole('heading', { name: `Because you saved ${source.title}` }),
    ).toBeVisible();
    await expect(
      suggestions.getByRole('heading', { name: similar.title, exact: true }),
    ).toBeVisible();
    await expect(
      suggestions
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: similar.title, exact: true }) })
        .locator('img[src*="/logos/visitor-home-studio.svg"]'),
    ).toBeVisible();
    await expect(suggestions.getByRole('heading', { name: source.title, exact: true })).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 1512, height: 900 });
    const recommendationHeading = suggestions.getByRole('heading', {
      name: `Because you saved ${source.title}`,
    });
    const recommendationMetadata = recommendationHeading.locator('..').locator('p');
    await expect(recommendationHeading).toHaveCSS('font-size', '32px');
    await expect(recommendationHeading).toHaveCSS('line-height', '38px');
    await expect(recommendationHeading).toHaveCSS('column-gap', '6px');
    await expect(recommendationHeading.locator('..')).toHaveCSS('row-gap', '2px');
    await expect(recommendationMetadata).toHaveCSS('font-size', '11px');
    await expect(recommendationMetadata).toHaveCSS('line-height', '14px');
    await expect(recommendationMetadata).toHaveCSS('letter-spacing', '0.66px');
    await expect(recommendationMetadata).toHaveCSS('text-transform', 'uppercase');
    await expect(recommendationMetadata).toHaveCSS('color', 'rgb(30, 122, 85)');
    await recommendationHeading
      .locator('..')
      .screenshot({ path: '/tmp/tickif-saved-recommendation-desktop.png' });
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(recommendationHeading).toHaveCSS('font-size', '24px');
    await expect(recommendationHeading).toHaveCSS('line-height', '28px');
    await expect(recommendationMetadata).toHaveCSS('font-size', '11px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await recommendationHeading
      .locator('..')
      .screenshot({ path: '/tmp/tickif-saved-recommendation-mobile.png' });
    for (const width of [320, 375, 390, 768, 1280, 1512]) {
      await page.setViewportSize({ width, height: width === 320 ? 480 : 844 });
      await page.mouse.move(0, 0);
      await expect(savedPill.getByText('Saved', { exact: true })).toBeVisible();
      const coverBox = (await sourceCard
        .getByRole('img', { name: `${source.title} image unavailable` })
        .boundingBox())!;
      expect(coverBox.width / coverBox.height).toBeCloseTo(4 / 5, 2);
      const photoCard = page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: similar.title, exact: true }) })
        .first();
      const photo = photoCard.getByRole('img', { name: similar.title });
      await expect(photo).toBeVisible();
      const budget = photoCard.getByText('₹15–35L', { exact: true });
      const brand = photoCard.locator('[data-slot="project-watermark"]');
      await expect(budget).toBeVisible();
      await expect(brand).toHaveText('TICKIF');
      await expect(budget).toHaveCSS('font-size', '10px');
      await expect(budget).toHaveCSS('height', '20px');
      await expect(budget).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.92)');
      await expect(brand).toHaveCSS('font-size', '10px');
      await expect(brand).toHaveCSS('opacity', '0.72');
      const photoBounds = (await photo.boundingBox())!;
      const priceBounds = (await budget.boundingBox())!;
      const brandBounds = (await brand.boundingBox())!;
      expect(priceBounds.x - photoBounds.x).toBeCloseTo(10, 0);
      expect(photoBounds.x + photoBounds.width - brandBounds.x - brandBounds.width).toBeCloseTo(
        10,
        0,
      );
      expect(photoBounds.y + photoBounds.height - brandBounds.y - brandBounds.height).toBeCloseTo(
        10,
        0,
      );
      expect(
        priceBounds.x + priceBounds.width <= brandBounds.x ||
          priceBounds.y + priceBounds.height <= brandBounds.y,
      ).toBe(true);
      if (width === 390 || width === 1512)
        await photoCard.screenshot({ path: `/tmp/tickif-card-footer-${width}.png` });
      await expect(page.getByRole('searchbox', { name: 'Search homes' })).toHaveCount(1);
      await expect(
        page.getByRole('button', { name: 'Search from header' }).locator('svg.lucide-search'),
      ).toBeVisible();
      const cityPicker = page.getByRole('combobox', { name: 'Header search city' });
      if (width === 1512) {
        const banner = page.getByRole('banner');
        await banner.screenshot({ path: '/tmp/tickif-nav-measured.png' });
        const bannerBox = (await banner.boundingBox())!;
        expect(bannerBox.height).toBe(72);
        const searchBox = (await banner.getByRole('search').boundingBox())!;
        expect(searchBox.width).toBe(470);
        const cityBox = (await cityPicker.boundingBox())!;
        expect(cityBox.height).toBe(32);
        const cityContentWidth = await cityPicker.evaluate((element) => {
          const styles = getComputedStyle(element);
          return (
            Array.from(element.children).reduce(
              (sum, child) => sum + child.getBoundingClientRect().width,
              0,
            ) +
            Number.parseFloat(styles.paddingLeft) +
            Number.parseFloat(styles.paddingRight) +
            Number.parseFloat(styles.gap) * (element.children.length - 1)
          );
        });
        expect(cityBox.width).toBeCloseTo(cityContentWidth, 0);
        const primary = banner.getByRole('navigation', { name: 'Primary' });
        await expect(primary.getByText('For you')).toHaveCSS('font-size', '14px');
        expect((await primary.getByText('For you').boundingBox())!.height).toBe(34);
        const actions = banner.getByRole('navigation', { name: 'Your activity' });
        const savedLink = actions.getByRole('link', { name: 'Saved 1', exact: true });
        expect((await savedLink.boundingBox())!.height).toBe(40);
        await expect(savedLink).toHaveCSS('font-size', '13px');
        await expect(savedLink.locator('svg')).toHaveCSS('width', '15px');
        await expect(cityPicker.locator('svg.lucide-map-pin')).toHaveCSS('width', '14px');
        await expect(cityPicker.locator('svg.lucide-chevron-down')).toHaveCSS('width', '12px');
        await expect(savedLink.locator('[data-slot=badge]')).toHaveCSS('font-size', '10px');
        expect((await savedLink.locator('[data-slot=badge]').boundingBox())!.height).toBe(16);
        const searchSurface = banner.getByRole('search').locator(':scope > div').first();
        expect((await searchSurface.boundingBox())!.height).toBe(42);
        const savedBox = (await savedLink.boundingBox())!;
        expect(savedBox.x - searchBox.x - searchBox.width).toBeCloseTo(8, 0);
        const account = banner.getByRole('button', {
          name: 'Open account menu for Visitor Home QA',
        });
        const accountBox = (await account.boundingBox())!;
        expect(accountBox.width).toBe(32);
        expect(width - accountBox.x - accountBox.width).toBeCloseTo(48, 0);
        const logo = banner.getByRole('link', { name: 'Tickif' });
        const logoBox = (await logo.boundingBox())!;
        expect(logoBox.x).toBeCloseTo(48, 0);
        expect(logoBox.width).toBeCloseTo(122.55, 0);
        expect(logoBox.height).toBeCloseTo(46.8, 0);
        const primaryBox = (await primary.boundingBox())!;
        expect(primaryBox.x - logoBox.x - logoBox.width).toBeCloseTo(36, 0);
        await banner.screenshot({ path: '/tmp/tickif-nav-desktop.png' });
      }
      if (width === 390)
        await page.getByRole('banner').screenshot({ path: '/tmp/tickif-nav-mobile.png' });
      await expect(cityPicker.locator('svg.lucide-map-pin')).toBeVisible();
      await expect(cityPicker.locator('svg.lucide-chevron-down')).toBeVisible();
      const activity = page
        .getByRole('navigation', { name: 'Your activity' })
        .filter({ visible: true });
      await expect(
        activity.getByRole('link', { name: 'Saved 1', exact: true }).locator('[data-slot=badge]'),
      ).toHaveCSS('background-color', 'rgb(23, 22, 18)');
      await expect(
        activity
          .getByRole('link', { name: 'Enquiries 1 NEW', exact: true })
          .locator('[data-slot=badge]'),
      ).toHaveCSS('background-color', 'rgb(188, 89, 53)');
      const accountFallback = page
        .getByRole('button', { name: 'Open account menu for Visitor Home QA' })
        .locator('[data-slot=avatar-fallback]');
      const diceBearAvatar = accountFallback.locator('img');
      await expect(diceBearAvatar).toBeVisible();
      await expect(diceBearAvatar).toHaveAttribute('src', /^data:image\/svg\+xml/);
      expect(
        await diceBearAvatar.evaluate((image: HTMLImageElement) => image.naturalWidth),
      ).toBeGreaterThan(0);
      for (const label of [
        activity.getByRole('link', { name: 'Saved 1', exact: true }).locator('[data-slot=badge]'),
        activity
          .getByRole('link', { name: 'Enquiries 1 NEW', exact: true })
          .locator('[data-slot=badge]'),
      ])
        expect(await labelContrast(label)).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const filtersButton = page.getByRole('button', { name: /^Filters/ });
      await expect(filtersButton).toBeVisible();
      await expect(filtersButton.locator('svg.lucide-sliders-horizontal')).toBeVisible();
      const fixedViews = page.getByRole('group', { name: 'Feed views' });
      const forYou = fixedViews.getByRole('button', { name: 'For you', exact: true });
      const rail = page.getByRole('group', { name: 'Feed categories' });
      await rail.scrollIntoViewIfNeeded();
      const beforeForYou = (await forYou.boundingBox())!;
      const beforeFilters = (await filtersButton.boundingBox())!;
      expect(beforeFilters.x + beforeFilters.width).toBeLessThanOrEqual(width);
      const railBox = (await rail.boundingBox())!;
      expect(railBox.x).toBeGreaterThanOrEqual(0);
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(width);
      expect(await forYou.evaluate((button) => getComputedStyle(button).height)).toBe('38px');
      const budgetChip = rail.getByRole('button', { name: 'Under ₹10L', exact: true });
      await rail.evaluate((element) => {
        element.scrollLeft = 0;
      });
      const categories = await rail.getByRole('button').all();
      const pageY = await page.evaluate(() => window.scrollY);
      await categories[0]!.focus();
      for (const [index, category] of categories.entries()) {
        if (index > 0) await page.keyboard.press('Tab');
        await expect(category).toBeFocused();
        const categoryBox = (await category.boundingBox())!;
        expect(categoryBox.x).toBeGreaterThanOrEqual(railBox.x - 1);
        expect(categoryBox.x + categoryBox.width).toBeLessThanOrEqual(
          railBox.x + railBox.width + 1,
        );
      }
      await expect(budgetChip).toBeFocused();
      const budgetBox = (await budgetChip.boundingBox())!;
      expect(budgetBox.x).toBeGreaterThanOrEqual(railBox.x - 1);
      expect(budgetBox.x + budgetBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 1);
      expect((await forYou.boundingBox())!.x).toBeCloseTo(beforeForYou.x, 0);
      expect((await filtersButton.boundingBox())!.x).toBeCloseTo(beforeFilters.x, 0);
      expect((await forYou.boundingBox())!.y).toBeCloseTo(beforeForYou.y, 0);
      expect((await filtersButton.boundingBox())!.y).toBeCloseTo(beforeFilters.y, 0);
      expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(pageY, 0);
      for (const image of await rail.locator('img').all()) {
        expect(
          await image.evaluate((element: HTMLImageElement) => element.naturalWidth),
        ).toBeGreaterThan(0);
        expect(await image.evaluate((element) => element.getBoundingClientRect().width)).toBe(28);
      }
      await rail.evaluate((element) => {
        element.scrollLeft = 0;
      });
      await filtersButton.click();
      for (const retired of ['₹5L - ₹15L', '₹15L - ₹35L', '₹35L+']) {
        await expect(
          page.getByRole('menuitemcheckbox', { name: retired, exact: true }),
        ).toHaveCount(0);
      }
      const applyFilters = page.getByRole('menuitem', { name: /Apply/ });
      await applyFilters.scrollIntoViewIfNeeded();
      await expect(applyFilters).toBeVisible();
      const applyBox = (await applyFilters.boundingBox())!;
      expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(width === 320 ? 480 : 844);
      const menuBox = (await page.getByRole('menu').first().boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      await page.keyboard.press('Escape');
      await forYou.focus();
      if (width === 390 || width === 1512) {
        await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
        await page.screenshot({
          path: testInfo.outputPath(`visitor-home-${width}.png`),
          animations: 'disabled',
        });
      }
    }
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const darkPhotoCard = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: similar.title, exact: true }) })
      .first();
    const darkBudget = darkPhotoCard.getByText('₹15–35L', { exact: true });
    await expect(darkBudget).toHaveCSS(
      'color',
      await page.evaluate(() => getComputedStyle(document.body).color),
    );
    await expect(darkBudget).not.toHaveCSS('background-color', 'rgba(255, 255, 255, 0.92)');
    await expect(darkPhotoCard.locator('[data-slot="project-watermark"]')).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    const darkActivity = page
      .getByRole('navigation', { name: 'Your activity' })
      .filter({ visible: true });
    await expect(
      darkActivity.getByRole('link', { name: 'Saved 1', exact: true }).locator('[data-slot=badge]'),
    ).toHaveCSS('background-color', 'rgb(244, 240, 232)');
    await expect(
      darkActivity
        .getByRole('link', { name: 'Enquiries 1 NEW', exact: true })
        .locator('[data-slot=badge]'),
    ).toHaveCSS('background-color', 'rgb(239, 154, 115)');
    for (const label of [
      darkActivity.getByRole('link', { name: 'Saved 1', exact: true }).locator('[data-slot=badge]'),
      darkActivity
        .getByRole('link', { name: 'Enquiries 1 NEW', exact: true })
        .locator('[data-slot=badge]'),
    ])
      expect(await labelContrast(label)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: testInfo.outputPath('visitor-header-dark.png'),
      animations: 'disabled',
    });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('menuitem', { name: /^BHK/ }).hover();
    const bhk = page.getByRole('menuitemcheckbox', { name: /3 BHK/ });
    await bhk.click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: /Apply/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/bhk=3-bhk/);
    await expect(page.getByRole('button', { name: /^Filters/ })).toContainText('(1)');
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Clear all', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/home\?feed=custom$/);
    await expect(page.getByRole('button', { name: /^Filters/ })).toHaveText('Filters');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('searchbox', { name: 'Search homes' })).toBeFocused();
    const removeButton = sourceCard.getByRole('button', {
      name: 'Remove saved project',
      exact: true,
    });
    await removeButton.scrollIntoViewIfNeeded();
    const scrollBeforeRemove = await page.evaluate(() => window.scrollY);
    homeRefreshRequests.length = 0;
    await removeButton.click();
    await expect(page.getByRole('link', { name: 'Saved 0', exact: true })).toBeVisible();
    expect(homeRefreshRequests).toEqual([]);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scrollBeforeRemove, 0);
    await expect(suggestions).toHaveCount(1);
    await page.reload();
    await expect(suggestions).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search homes' }).fill(source.title);
    await page.getByRole('searchbox', { name: 'Search homes' }).press('Enter');
    await expect(page).toHaveURL(/q=Visitor/);
    await expect(studioLogo).toBeVisible();
    await expect(verifiedTick).toBeVisible();
    await db
      .update(schema.verificationApplication)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verificationApplication.organizationId, designer.orgId));
    await page.reload();
    await expect(verifiedTick).toHaveCount(0);
    await expect(studioLogo).toBeVisible();
    await page.getByRole('link', { name: 'Enquiries 1 NEW', exact: true }).click();
    await expect(page).toHaveURL(/\/enquiries$/);
    await expect(page.getByText('Synthetic visitor enquiry', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await deleteObject(coverKey);
    await deleteSearchDocument('projects', source.id);
    await deleteSearchDocument('projects', similar.id);
    await db.delete(schema.enquiry).where(eq(schema.enquiry.requesterId, visitor.id));
    await db.delete(schema.project).where(eq(schema.project.id, source.id));
    await db.delete(schema.project).where(eq(schema.project.id, similar.id));
    await db.delete(schema.designerProfile).where(eq(schema.designerProfile.id, designer.id));
    await db.delete(schema.organization).where(eq(schema.organization.id, designer.orgId));
    if (designer.userId) await db.delete(schema.user).where(eq(schema.user.id, designer.userId));
    await db.delete(schema.user).where(eq(schema.user.id, visitor.id));
  }
});
