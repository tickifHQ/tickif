import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeProject } from '@repo/db/testing';
import { upsertSearchDocument, deleteSearchDocument } from '@repo/search';
import { apiUrl } from '../lib/environment';
import { phoneCode, removeSyntheticUserByPhone, signInPhone } from '../lib/auth';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`visitor welcome saves matching feed, restores choices and clears filters on ${viewport.name}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await assertTestDb();
    await page.setViewportSize(viewport);
    const phone = `+9193${randomInt(10_000_000, 99_999_999)}`;
    const designer = await makeDesigner({ status: 'active', slug: `welcome-${randomUUID()}` });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      title: 'Welcome Adyar Family Home',
      citySlug: 'chennai',
      localitySlug: 'adyar',
      bhkSlug: '4-bhk',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      // This test deliberately rejects saves with 503 and 422 to exercise retry.
      if (/Failed to load resource:.*\b(503|422)\b/.test(message.text())) return;
      errors.push(message.text());
    });
    await upsertSearchDocument('projects', {
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: 'Welcome flow fixture',
      designerId: designer.id,
      designerSlug: designer.slug,
      designerName: designer.displayName,
      citySlug: 'chennai',
      cityName: null,
      localitySlug: 'adyar',
      propertyTypeSlug: 'residential',
      propertySubtypeSlug: 'apartment',
      scopeSlug: 'full-home',
      bhkSlug: '4-bhk',
      budgetBandSlug: '5l-10l',
      sizeSqft: 1400,
      themes: [],
      materials: [],
      finishes: [],
      roomSlugs: [],
      roomLabels: [],
      tags: [],
      coverImageKey: null,
      publishedAt: Date.now(),
      featuredAt: null,
      avgRating: 0,
      reviewCount: 0,
    });
    try {
      await page.goto('/');
      await page.getByRole('link', { name: 'Log in', exact: true }).click();
      await page.getByPlaceholder('9123456789').fill(phone.slice(3));
      await page.getByRole('button', { name: 'Get OTP', exact: true }).click();
      const firstDigit = page.getByRole('textbox', { name: 'OTP digit 1', exact: true });
      await expect(firstDigit).toBeVisible();
      await firstDigit.fill(await phoneCode(phone));
      await expect(page.getByRole('heading', { name: 'You’re in — welcome!' })).toBeVisible();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: '4 BHK+' }).click();
      await page.getByRole('combobox', { name: 'Where is it?' }).click();
      await page.getByRole('option', { name: 'Adyar, Chennai', exact: true }).click();
      await expect(page.getByText(/projects? match(?:es)? your home/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `/tmp/tickif-visitor-review/welcome-${viewport.name}.png`,
        animations: 'disabled',
        caret: 'initial',
      });

      await page.route('**/api/visitors/me/feed-preferences', async (route) => {
        if (route.request().method() === 'PUT')
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Please retry saving' } }),
          });
        else await route.continue();
      });
      const submit = page.getByRole('button', { name: 'Show my feed' });
      const before = await submit.boundingBox();
      await submit.click();
      await expect(page.getByRole('alert')).toContainText('Please retry saving');
      expect((await submit.boundingBox())?.y).toBe(before?.y);
      await expect(page.getByRole('button', { name: '4 BHK+' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.unroute('**/api/visitors/me/feed-preferences');
      await submit.click();
      await expect(page).toHaveURL(
        /\/home\?feed=custom&bhk=4-bhk%2C4-plus-bhk&city=chennai&locality=adyar/,
      );
      await expect(page.getByRole('article').filter({ hasText: project.title })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /Good (morning|afternoon|evening)/,
      );
      await expect(page.getByRole('button', { name: 'Edit customization' })).toBeVisible();
      await page.getByRole('searchbox', { name: 'Search homes' }).fill('teak');
      await page.setViewportSize({ width: viewport.name === 'mobile' ? 1440 : 390, height: 844 });
      await expect(page.getByRole('searchbox', { name: 'Search homes' })).toHaveValue('teak');
      await page.setViewportSize(viewport);
      await page.getByRole('searchbox', { name: 'Search homes' }).fill('');
      await expect(page.getByRole('link', { name: /Saved 0/ })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Enquiries 0', exact: true })).toBeVisible();
      await expect(page.getByText('Following', { exact: true })).toHaveCount(0);
      await page.getByRole('link', { name: 'Near you' }).click();
      await expect(page).toHaveURL(/city=chennai&locality=adyar&view=nearby/);
      await expect(page.getByRole('link', { name: 'Near you' })).toHaveText('Near youAdyar');
      await expect(page.getByRole('link', { name: 'Near you' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const nearbyBox = (await page.getByRole('link', { name: 'Near you' }).boundingBox())!;
      const locationLabel = page.getByRole('link', { name: 'Near you' }).locator('span');
      await locationLabel.evaluate((element) => {
        element.textContent = 'A very long locality name that should not move the fixed controls';
      });
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const longLocationBox = (await page.getByRole('link', { name: 'Near you' }).boundingBox())!;
      expect(longLocationBox.x + longLocationBox.width).toBeLessThanOrEqual(320);
      await locationLabel.evaluate((element) => {
        element.textContent = 'Adyar';
      });
      await page.setViewportSize(viewport);
      const filtersBox = (await page.getByRole('button', { name: /^Filters/ }).boundingBox())!;
      const views = page.getByRole('group', { name: 'Feed views' });
      const dividerBox = (await views.locator('[data-slot=separator]').boundingBox())!;
      await page.getByRole('group', { name: 'Feed categories' }).evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      expect((await page.getByRole('link', { name: 'Near you' }).boundingBox())!.x).toBeCloseTo(
        nearbyBox.x,
        0,
      );
      expect((await page.getByRole('button', { name: /^Filters/ }).boundingBox())!.x).toBeCloseTo(
        filtersBox.x,
        0,
      );
      expect((await views.locator('[data-slot=separator]').boundingBox())!.x).toBeCloseTo(
        dividerBox.x,
        0,
      );
      await page.getByRole('group', { name: 'Feed categories' }).evaluate((element) => {
        element.scrollLeft = 0;
      });
      expect(new URL(page.url()).searchParams.has('bhk')).toBe(false);
      await page.getByRole('button', { name: 'Kitchens', exact: true }).click();
      await expect(page).toHaveURL(/room=modular-kitchen/);
      await page.getByRole('button', { name: 'Under ₹10L', exact: true }).click();
      await expect(page).toHaveURL(/budgetBand=/);
      expect(new URL(page.url()).searchParams.has('room')).toBe(false);
      await page.getByRole('button', { name: 'For you', exact: true }).click();
      await expect(page).toHaveURL(/bhk=4-bhk%2C4-plus-bhk&city=chennai&locality=adyar/);
      const saved = await context.request.get(`${apiUrl}/api/visitors/me/feed-preferences`);
      expect((await saved.json()).preferences).toEqual({
        homeType: '4-plus-bhk',
        citySlug: 'chennai',
        localitySlug: 'adyar',
      });
      await page.goto('/home');
      await expect(page).toHaveURL(/locality=adyar/);
      await expect(page.getByRole('article').filter({ hasText: project.title })).toBeVisible();
      await page.screenshot({
        path: `/tmp/tickif-visitor-review/feed-${viewport.name}.png`,
        animations: 'disabled',
        // The streamed header may still be hydrating. Playwright's default
        // caret hiding temporarily writes inline styles to every input.
        caret: 'initial',
      });
      await page.getByRole('link', { name: 'Explore', exact: true }).click();
      await expect(page).toHaveURL(/\/home\?feed=custom&view=explore$/);
      await page.reload();
      await expect(page).toHaveURL(/\/home\?feed=custom&view=explore$/);
      const edit = page.getByRole('button', { name: 'Edit customization' });
      const beforeEdit = page.url();
      await page.evaluate(() => Reflect.set(window, 'customizationDocumentMarker', 'original'));
      await edit.click();
      const customization = page.getByRole('dialog', { name: 'Edit customization' });
      await expect(customization).toBeVisible();
      await expect(customization.getByRole('combobox')).toHaveText('Adyar, Chennai');
      await expect(
        customization.getByRole('button', { name: 'Close customization' }),
      ).toBeFocused();
      await expect(customization.getByText('Welcome to Tickif')).toHaveCount(0);
      await expect(customization.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
      await expect(customization.getByRole('button', { name: '4 BHK+' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(page.url()).toBe(beforeEdit);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `/tmp/tickif-customization-${viewport.name}.png`,
        animations: 'disabled',
        caret: 'initial',
      });
      await page.setViewportSize({ width: 320, height: 400 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const shortDialog = (await customization.boundingBox())!;
      expect(shortDialog.y).toBeGreaterThanOrEqual(15);
      expect(shortDialog.y + shortDialog.height).toBeLessThanOrEqual(385);
      await customization.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded();
      await expect(customization.getByRole('button', { name: 'Save changes' })).toBeInViewport();
      await page.screenshot({
        path: '/tmp/tickif-customization-short.png',
        animations: 'disabled',
        caret: 'initial',
      });
      await page.setViewportSize(viewport);
      await customization.getByRole('button', { name: 'Villa' }).click();
      await customization.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(customization).toHaveCount(0);
      await expect(edit).toBeFocused();
      expect(page.url()).toBe(beforeEdit);
      await edit.click();
      await expect(customization.getByRole('button', { name: '4 BHK+' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.keyboard.press('Escape');
      await expect(customization).toHaveCount(0);
      await edit.click();
      await expect(customization.getByRole('combobox')).toHaveText('Adyar, Chennai');
      await customization.getByRole('button', { name: '4 BHK+' }).click();
      await customization.getByRole('combobox').click();
      await page.getByRole('option', { name: 'Choose city or locality', exact: true }).click();
      await page.route('**/api/visitors/me/feed-preferences', async (route) => {
        if (route.request().method() === 'PUT')
          await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Please retry saving' } }),
          });
        else await route.continue();
      });
      await customization.getByRole('button', { name: 'Save changes' }).click();
      await expect(customization.getByRole('alert')).toHaveText('Please retry saving');
      expect(page.url()).toBe(beforeEdit);
      await page.unroute('**/api/visitors/me/feed-preferences');
      await customization.getByRole('button', { name: 'Save changes' }).click();
      await expect(page).toHaveURL(/\/home\?feed=custom$/);
      await expect(customization).toHaveCount(0);
      expect(await page.evaluate(() => Reflect.get(window, 'customizationDocumentMarker'))).toBe(
        'original',
      );
      expect(
        (await (await context.request.get(`${apiUrl}/api/visitors/me/feed-preferences`)).json())
          .preferences,
      ).toEqual({ homeType: null, citySlug: null, localitySlug: null });
      expect(errors).toEqual([]);
    } finally {
      await removeSyntheticUserByPhone(phone);
      await deleteSearchDocument('projects', project.id);
      await db.delete(schema.project).where(eq(schema.project.id, project.id));
      await db.delete(schema.designerProfile).where(eq(schema.designerProfile.id, designer.id));
      if (designer.userId) await db.delete(schema.user).where(eq(schema.user.id, designer.userId));
    }
  });
}

test('direct onboarding Skip completes a pending account and returns to the original page', async ({
  page,
  context,
}) => {
  const phone = `+9193${randomInt(10_000_000, 99_999_999)}`;
  try {
    await signInPhone(context, phone);
    await page.goto('/login?callbackURL=%2Fdesigners');
    await expect(page).toHaveURL(/\/onboarding\?callbackURL=/);
    await page.getByRole('button', { name: 'Skip setup' }).click();
    await expect(page).toHaveURL('/designers');
    const session = await context.request.get(
      `${apiUrl}/api/auth/get-session?disableCookieCache=true`,
    );
    expect((await session.json()).user.status).toBe('active');
  } finally {
    await removeSyntheticUserByPhone(phone);
  }
});

test('small phone can select Villa and reach every welcome control without horizontal scrolling', async ({
  page,
  context,
}) => {
  const phone = `+9193${randomInt(10_000_000, 99_999_999)}`;
  await page.setViewportSize({ width: 320, height: 568 });
  try {
    await signInPhone(context, phone);
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Villa' }).click();
    await expect(page.getByRole('combobox', { name: 'Where is it?' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Show my feed' }).click();
    await expect(page).toHaveURL(
      /\/home\?feed=custom&propertyType=residential&propertySubtype=villa$/,
    );
    const saved = await context.request.get(`${apiUrl}/api/visitors/me/feed-preferences`);
    expect((await saved.json()).preferences).toEqual({
      homeType: 'villa',
      citySlug: null,
      localitySlug: null,
    });
  } finally {
    await removeSyntheticUserByPhone(phone);
  }
});
