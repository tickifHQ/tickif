import Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import { makeDesigner } from '@repo/db/testing';

// Only the billable Places call and the queue are stubbed; the cooldown uses real Redis.
const places = vi.hoisted(() => ({
  isGooglePlacesConfigured: vi.fn(() => true),
  resolvePlaceId: vi.fn(async () => 'ChIJcooldown'),
}));
const queue = vi.hoisted(() => ({ enqueueGoogleReviewsRefresh: vi.fn(async () => undefined) }));
const profile = vi.hoisted(() => ({ id: '' }));

vi.mock('@repo/google-places', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isGooglePlacesConfigured: places.isGooglePlacesConfigured,
  resolvePlaceId: places.resolvePlaceId,
}));
vi.mock('@repo/queue', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  enqueueGoogleReviewsRefresh: queue.enqueueGoogleReviewsRefresh,
}));
vi.mock('../../../src/modules/profiles/portfolio-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveProfile: vi.fn(async () => ({ id: profile.id })),
}));

const { googleReviewsService } = await import('../../../src/modules/profiles/google-service.js');

const redis = new Redis(config.REDIS_URL);
const caller = { userId: 'user-1', activeOrgId: 'org-1', activeTeamId: 'team-1' };

describe('Google connection cooldown', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    profile.id = (await makeDesigner({ status: 'active' })).id;
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('keeps the cooldown when the designer disconnects and reconnects', async () => {
    await googleReviewsService.connect({ reference: 'Studio Mumbai' }, caller);
    await googleReviewsService.disconnect(caller);

    await expect(
      googleReviewsService.connect({ reference: 'Studio Mumbai' }, caller),
    ).rejects.toMatchObject({ status: 429 });
    expect(places.resolvePlaceId).toHaveBeenCalledTimes(1);
    expect(queue.enqueueGoogleReviewsRefresh).toHaveBeenCalledTimes(1);
  });

  it('gates a refresh right after connecting and expires the cooldown', async () => {
    await googleReviewsService.connect({ reference: 'Studio Mumbai' }, caller);

    await expect(googleReviewsService.refresh(caller)).rejects.toMatchObject({ status: 429 });
    const ttl = await redis.pttl(`cache:google-places-attempt:${profile.id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10_000);
  });
});
