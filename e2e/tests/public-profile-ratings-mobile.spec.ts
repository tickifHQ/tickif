import '../lib/environment';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, eq, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { makePublicPortfolio } from '../lib/public-portfolio';

test('Google rating summary and review carousel fit narrow profile screens', async ({ page }) => {
  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({ name: 'Demo ratings owner', role: 'designer', status: 'active' });
  const organization = await makeOrganization({ name: 'Demo ratings studio' });
  const author = await makeUser({ name: 'Demo ratings reviewer', status: 'active' });
  let profileId: string | undefined;
  try {
    const profile = await makeDesigner({
      userId: owner.id,
      orgId: organization.id,
      displayName: organization.name,
      slug: `ratings-${suffix}`,
      status: 'active',
      bio: 'Synthetic studio for Google review layout verification.',
      logoImageId: 'e2e/public/ratings-studio-logo.png',
      avgRating: '5.00',
      reviewCount: 1,
    });
    profileId = profile.id;
    await makePublicPortfolio({ profileId: profile.id, portfolioSlug: profile.slug });
    const timestamp = new Date();
    await db.insert(schema.review).values({
      designerProfileId: profile.id,
      authorUserId: author.id,
      rating: 5,
      body: 'Demo review for testing the public profile on narrow screens.',
      status: 'published',
      createdAt: timestamp,
      updatedAt: timestamp,
      publishedAt: timestamp,
      moderatedAt: timestamp,
    });
    await db.insert(schema.googlePlaceCache).values({
      profileId: profile.id,
      placeId: `demo-ratings-${suffix}`,
      rating: '4.8',
      userRatingsTotal: 5,
      reviews: [1, 2, 3, 4, 5].map((number) => ({
        author: `Demo Google reviewer ${number}`,
        authorUrl: null,
        profilePhotoUrl: null,
        rating: number === 5 ? 4 : 5,
        text: `Demo Google review ${number} for responsive carousel testing.`,
        relativeTime: '1 week ago',
        time: Math.floor(timestamp.getTime() / 1000) - number,
      })),
      status: 'connected',
      lastFetchedAt: new Date(),
    });

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto(`/d/${profile.slug}`);
      expect(response?.status()).toBe(200);
      const ratings = page.getByRole('region', { name: 'Client ratings' });
      await expect(ratings.getByRole('tablist')).toHaveCount(0);
      await expect(ratings.getByText('5 Google reviews')).toBeVisible();
      const carousel = ratings.getByRole('region', { name: 'Google client reviews' });
      await expect(carousel.getByRole('article')).toHaveCount(2);
      await ratings.getByRole('button', { name: 'Go to review page 3' }).click();
      await expect(carousel.getByRole('article')).toHaveCount(1);
      await expect(carousel.getByRole('article')).toContainText('Demo Google reviewer 5');
      await ratings.getByRole('button', { name: 'Go to review page 1' }).click();
      expect(
        await ratings.locator('.profile-rating-wreath').evaluateAll((wreaths) =>
          wreaths
            .filter((wreath) => wreath.getBoundingClientRect().width > 0)
            .every((wreath) => {
              const artwork = wreath.querySelector('img');
              return (
                artwork !== null &&
                artwork.getBoundingClientRect().width <= wreath.getBoundingClientRect().width + 1
              );
            }),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  } finally {
    await assertTestDb();
    if (profileId)
      await db.delete(schema.review).where(eq(schema.review.designerProfileId, profileId));
    await db.delete(schema.organization).where(eq(schema.organization.id, organization.id));
    await db.delete(schema.user).where(eq(schema.user.id, owner.id));
    await db.delete(schema.user).where(eq(schema.user.id, author.id));
  }
});
