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
        text: `Demo Google review ${number} for responsive review-card testing.`,
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
      const summary = ratings.getByRole('complementary', { name: 'Google rating summary' });
      await expect(summary.getByText('4.8', { exact: true })).toBeVisible();
      await expect(summary.getByText('5 reviews on Google')).toBeVisible();
      // The redesign shows the three most recent reviews together and retains
      // access to all five reviews through the real Google destination.
      const cards = ratings.getByTestId('profile-review-cards').getByRole('article');
      await expect(cards).toHaveCount(3);
      for (const number of [1, 2, 3]) {
        const card = cards.filter({ hasText: `Demo Google reviewer ${number}` });
        await expect(card).toBeVisible();
        await expect(card).toContainText(
          `Demo Google review ${number} for responsive review-card testing.`,
        );
        await expect(card.getByLabel('5.0 out of 5')).toBeVisible();
        expect(
          await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
          `Google review ${number} fits at ${width}px`,
        ).toBe(true);
      }
      await expect(ratings.getByText('Demo Google reviewer 4', { exact: true })).toHaveCount(0);
      await expect(ratings.getByText('Demo Google reviewer 5', { exact: true })).toHaveCount(0);
      await expect(ratings.getByText('3 of 5', { exact: true })).toBeVisible();
      const readAll = summary.getByRole('link', { name: 'Read all 5 on Google' });
      const writeReview = summary.getByRole('link', { name: 'Worked with them? Write a review' });
      await expect(readAll).toHaveAttribute(
        'href',
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(organization.name)}&query_place_id=demo-ratings-${suffix}`,
      );
      await expect(writeReview).toHaveAttribute(
        'href',
        `https://search.google.com/local/writereview?placeid=demo-ratings-${suffix}`,
      );
      for (const link of [readAll, writeReview]) {
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
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
