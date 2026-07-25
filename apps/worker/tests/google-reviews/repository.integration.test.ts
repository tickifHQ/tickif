import { describe, it, expect } from 'vitest';
import { db, schema } from '@repo/db';
import { makeDesigner } from '@repo/db/testing';
import { findDueForRefresh } from '../../src/google-reviews/repository.js';

type Status = 'pending' | 'connected' | 'error' | 'stale';

/** Seed one designer profile + its google_place_cache row and return the profile id. */
async function seedCache(status: Status, lastFetchedAt: Date | null): Promise<string> {
  const designer = await makeDesigner();
  await db.insert(schema.googlePlaceCache).values({
    profileId: designer.id,
    placeId: 'ChIJseed',
    status,
    lastFetchedAt,
  });
  return designer.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('findDueForRefresh (integration)', () => {
  it('refreshes pending, aging-connected and stale rows; skips error and freshly-fetched rows', async () => {
    const now = new Date();
    // The sweep passes `now - refreshDays`; anything older than this is "due".
    const cutoff = new Date(now.getTime() - 7 * DAY_MS);
    const beforeCutoff = new Date(now.getTime() - 30 * DAY_MS);
    const afterCutoff = new Date(now.getTime() - 60 * 1000);

    const pendingNeverFetched = await seedCache('pending', null);
    const connectedAging = await seedCache('connected', beforeCutoff);
    // `stale` rows keep a valid placeId and must be re-fetched so a recovered
    // place repopulates (regression guard for the #285 status-set change).
    const staleAging = await seedCache('stale', beforeCutoff);
    // Terminally-`error` rows are intentionally excluded — they re-fail
    // deterministically and would burn Places quota every tick.
    const errorAging = await seedCache('error', beforeCutoff);
    const errorNeverFetched = await seedCache('error', null);
    const connectedFresh = await seedCache('connected', afterCutoff);

    const due = await findDueForRefresh(cutoff, 100);

    expect(due).toEqual(
      expect.arrayContaining([pendingNeverFetched, connectedAging, staleAging]),
    );
    expect(due).not.toContain(errorAging);
    expect(due).not.toContain(errorNeverFetched);
    expect(due).not.toContain(connectedFresh);
    expect(due).toHaveLength(3);
  });

  it('bounds the batch to the requested limit', async () => {
    const now = new Date();
    await seedCache('pending', null);
    await seedCache('pending', null);
    await seedCache('pending', null);

    const due = await findDueForRefresh(now, 2);
    expect(due).toHaveLength(2);
  });
});
