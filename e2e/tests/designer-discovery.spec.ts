import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { config } from '@repo/config';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, migrateTestDb } from '@repo/db/testing';
import {
  bootstrapSearch,
  deleteSearchDocument,
  upsertSearchDocument,
  type DesignerSearchDocument,
} from '@repo/search';

const term = 'audit11directory';
const documents: DesignerSearchDocument[] = [];
let profile: Awaited<ReturnType<typeof makeDesigner>> | undefined;

test.describe('public designer discovery', () => {
  // These journeys intentionally share one precisely sized Typesense fixture.
  // Keep them in one worker so fullyParallel does not create overlapping copies.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const database = new URL(config.DATABASE_URL);
    if (
      !['localhost', '127.0.0.1'].includes(database.hostname) ||
      !database.pathname.endsWith('_test') ||
      config.DATABASE_URL !== config.DATABASE_URL_TEST ||
      !config.TYPESENSE_COLLECTION_PREFIX.includes('stage11')
    ) {
      throw new Error(
        'Directory fixtures require matching local *_test database URLs and a stage11 search prefix.',
      );
    }
    await migrateTestDb(config.DATABASE_URL);
    await assertTestDb();
    await bootstrapSearch();
    profile = await makeDesigner({
      displayName: 'Audit11Directory Studio 01',
      slug: `audit11-${randomUUID()}`,
      status: 'active',
      entityType: 'company',
    });
    for (let index = 0; index < 26; index++) {
      const document: DesignerSearchDocument = {
        id: index === 0 ? profile.id : randomUUID(),
        slug: index === 0 ? profile.slug : `audit11-${randomUUID()}`,
        displayName: `Audit11Directory Studio ${String(index + 1).padStart(2, '0')}`,
        bio: 'Synthetic directory fixture. Thoughtful homes and spaces.',
        entityType: index === 25 ? 'individual' : 'company',
        citySlugs: [index === 25 ? 'pune' : 'mumbai'],
        localitySlugs: ['bandra'],
        scopeSlugs: ['full-home'],
        themeSlugs: ['modern'],
        yearsExperience: 26 - index,
        projectCount: 26 - index,
        avgRating: 4.5,
        reviewCount: 5,
        isKycVerified: false,
        kycExpiresAt: 0,
        logoImageKey: null,
        updatedAt: 1_700_000_000_000 + index,
      };
      documents.push(document);
      await upsertSearchDocument('designers', document);
    }
  });
  test.afterAll(async () => {
    await Promise.all(documents.map((document) => deleteSearchDocument('designers', document.id)));
    if (profile) {
      await assertTestDb();
      await db.delete(schema.organization).where(eq(schema.organization.id, profile.orgId));
      if (profile.userId) await db.delete(schema.user).where(eq(schema.user.id, profile.userId));
    }
  });

  test('searches real indexed designers, pages with keyboard, and preserves browser history', async ({
    page,
  }) => {
    await page.goto(`/designers?q=${term}&sort=yearsExperience%3Adesc`);
    await expect(page.getByRole('heading', { name: 'Find your designer' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(24);
    const next = page.getByRole('link', { name: 'Next page' });
    await next.focus();
    await next.press('Enter');
    await expect(page).toHaveURL(new RegExp('page=2'));
    await expect(page.getByRole('article')).toHaveCount(2);
    await page.goBack();
    await expect(page.getByRole('article')).toHaveCount(24);
    await expect(page.getByRole('searchbox', { name: 'Search designers' })).toHaveValue(term);
    await page.getByRole('link', { name: 'View Audit11Directory Studio 01 profile' }).click();
    await expect(page).toHaveURL(`/d/${profile!.slug}`);
    await expect(
      page.getByRole('heading', { name: 'Audit11Directory Studio 01', exact: true }).first(),
    ).toBeVisible();
  });

  test('applies combined filters at page one, and can recover from empty results', async ({
    page,
  }) => {
    await page.goto(`/designers?q=${term}&citySlugs=mumbai&sort=yearsExperience%3Adesc&page=2`);
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Designer type' }).selectOption('individual');
    await page.getByRole('button', { name: 'Find designers', exact: true }).click();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/citySlugs=mumbai/);
    await expect(page.getByRole('heading', { name: 'No designers found' })).toBeVisible();
    await page.getByRole('link', { name: 'Browse all designers' }).click();
    await expect(page.getByRole('article')).toHaveCount(24);
  });

  test('is reachable on mobile and contains cards and filters without horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/designers?q=${term}&citySlugs=pune`);
    await expect(
      page
        .getByRole('navigation', { name: 'Mobile primary' })
        .getByRole('link', { name: 'Designers', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath('designer-directory-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
  });
});
