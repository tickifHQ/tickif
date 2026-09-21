import { describe, expect, it } from 'vitest';
import { db, schema } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { findFreshGoogleRatings } from '../../../src/modules/search/repository.js';

describe('designer search Google rating projection', () => {
  it('returns only fresh, connected aggregate ratings', async () => {
    const fresh = await makeDesigner({ status: 'active' });
    const stale = await makeDesigner({ status: 'active' });
    const errored = await makeDesigner({ status: 'active' });
    const neverConnected = await makeDesigner({ status: 'active' });
    const hidden = await makeDesigner({ status: 'active' });

    await db.insert(schema.designerPortfolio).values({
      profileId: hidden.id,
      showGoogleOverallRating: false,
    });

    await db.insert(schema.googlePlaceCache).values([
      {
        profileId: fresh.id,
        placeId: 'ChIJfresh',
        rating: '4.9',
        userRatingsTotal: 127,
        status: 'connected',
        lastFetchedAt: new Date(),
      },
      {
        profileId: stale.id,
        placeId: 'ChIJstale',
        rating: '4.8',
        userRatingsTotal: 80,
        status: 'connected',
        lastFetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
      {
        profileId: errored.id,
        placeId: 'ChIJerror',
        rating: '4.7',
        userRatingsTotal: 60,
        status: 'error',
        lastFetchedAt: new Date(),
      },
      {
        profileId: neverConnected.id,
        placeId: 'ChIJpending',
        status: 'pending',
      },
      {
        profileId: hidden.id,
        placeId: 'ChIJhidden',
        rating: '5.0',
        userRatingsTotal: 200,
        status: 'connected',
        lastFetchedAt: new Date(),
      },
    ]);

    const ratings = await findFreshGoogleRatings([
      fresh.id,
      stale.id,
      errored.id,
      neverConnected.id,
      hidden.id,
    ]);

    expect(ratings).toEqual(new Map([[fresh.id, { rating: 4.9, ratingCount: 127 }]]));
  });

  it('avoids querying when there are no designer ids', async () => {
    await expect(findFreshGoogleRatings([])).resolves.toEqual(new Map());
  });
});
