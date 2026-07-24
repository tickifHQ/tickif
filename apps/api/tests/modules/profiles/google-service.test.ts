import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (declared before importing the service under test) ---

class FakeGooglePlacesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

const places = vi.hoisted(() => ({
  isGooglePlacesConfigured: vi.fn(() => true),
  resolvePlaceId: vi.fn(),
}));
const queue = vi.hoisted(() => ({ enqueueGoogleReviewsRefresh: vi.fn() }));
const repo = vi.hoisted(() => ({
  findByProfileId: vi.fn(),
  upsert: vi.fn(),
  touchAttempt: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@repo/google-places', () => ({
  isGooglePlacesConfigured: places.isGooglePlacesConfigured,
  resolvePlaceId: places.resolvePlaceId,
  GooglePlacesError: FakeGooglePlacesError,
}));
vi.mock('@repo/queue', () => ({ enqueueGoogleReviewsRefresh: queue.enqueueGoogleReviewsRefresh }));
vi.mock('../../../src/modules/profiles/portfolio-service.js', () => ({
  resolveProfile: vi.fn(async () => ({ id: 'profile-1' })),
}));
vi.mock('../../../src/modules/profiles/google-repository.js', () => ({
  googleReviewsRepository: repo,
}));

const { googleReviewsService } = await import('../../../src/modules/profiles/google-service.js');

const CALLER = { userId: 'u1', activeOrgId: 'org1' };

function cacheRow(overrides: Record<string, unknown> = {}) {
  return {
    profileId: 'profile-1',
    placeId: 'ChIJabc',
    rating: '4.8',
    userRatingsTotal: 132,
    reviews: [],
    status: 'connected',
    lastFetchedAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('googleReviewsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    places.isGooglePlacesConfigured.mockReturnValue(true);
  });

  describe('connect', () => {
    it('resolves the reference, stores it pending, and enqueues a fetch', async () => {
      places.resolvePlaceId.mockResolvedValue('ChIJresolved');
      repo.upsert.mockResolvedValue(
        cacheRow({ placeId: 'ChIJresolved', status: 'pending', rating: null, userRatingsTotal: null, lastFetchedAt: null }),
      );

      const result = await googleReviewsService.connect({ reference: 'Studio Aakar' }, CALLER);

      expect(places.resolvePlaceId).toHaveBeenCalledWith('Studio Aakar');
      expect(repo.upsert).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({ placeId: 'ChIJresolved', status: 'pending' }),
      );
      expect(queue.enqueueGoogleReviewsRefresh).toHaveBeenCalledWith({ profileId: 'profile-1' });
      expect(result.connection?.status).toBe('pending');
      expect(result.available).toBe(true);
    });

    it('maps an invalid reference to a 400', async () => {
      places.resolvePlaceId.mockRejectedValue(new FakeGooglePlacesError('invalid_input', 'bad'));
      await expect(
        googleReviewsService.connect({ reference: 'garbage' }, CALLER),
      ).rejects.toMatchObject({ status: 400 });
      expect(queue.enqueueGoogleReviewsRefresh).not.toHaveBeenCalled();
    });

    it('rejects when the feature is unavailable', async () => {
      places.isGooglePlacesConfigured.mockReturnValue(false);
      await expect(
        googleReviewsService.connect({ reference: 'x' }, CALLER),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('throttles a rapid repeat connect without making a billable call', async () => {
      // An existing row stamped moments ago is inside the cooldown window.
      repo.findByProfileId.mockResolvedValue(cacheRow({ lastAttemptAt: new Date() }));
      await expect(
        googleReviewsService.connect({ reference: 'Studio Aakar' }, CALLER),
      ).rejects.toMatchObject({ status: 429 });
      expect(places.resolvePlaceId).not.toHaveBeenCalled();
      expect(queue.enqueueGoogleReviewsRefresh).not.toHaveBeenCalled();
    });

    it('stamps the attempt clock before resolving when a row already exists', async () => {
      // Past the cooldown, so the attempt proceeds and is re-stamped first.
      repo.findByProfileId.mockResolvedValue(
        cacheRow({ lastAttemptAt: new Date(Date.now() - 60_000) }),
      );
      places.resolvePlaceId.mockResolvedValue('ChIJresolved');
      repo.upsert.mockResolvedValue(cacheRow({ placeId: 'ChIJresolved', status: 'pending' }));

      await googleReviewsService.connect({ reference: 'Studio Aakar' }, CALLER);

      expect(repo.touchAttempt).toHaveBeenCalledWith('profile-1');
      expect(places.resolvePlaceId).toHaveBeenCalledWith('Studio Aakar');
    });
  });

  describe('refresh', () => {
    it('404s when nothing is connected', async () => {
      repo.findByProfileId.mockResolvedValue(null);
      await expect(googleReviewsService.refresh(CALLER)).rejects.toMatchObject({ status: 404 });
    });

    it('enqueues a refresh when connected', async () => {
      repo.findByProfileId.mockResolvedValue(cacheRow());
      await googleReviewsService.refresh(CALLER);
      expect(repo.touchAttempt).toHaveBeenCalledWith('profile-1');
      expect(queue.enqueueGoogleReviewsRefresh).toHaveBeenCalledWith({ profileId: 'profile-1' });
    });

    it('throttles a rapid repeat refresh without enqueuing', async () => {
      repo.findByProfileId.mockResolvedValue(cacheRow({ lastAttemptAt: new Date() }));
      await expect(googleReviewsService.refresh(CALLER)).rejects.toMatchObject({ status: 429 });
      expect(queue.enqueueGoogleReviewsRefresh).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns a not-connected shape when there is no row', async () => {
      repo.findByProfileId.mockResolvedValue(null);
      const result = await googleReviewsService.get(CALLER);
      expect(result).toEqual({ available: true, connection: null, reviews: [] });
    });

    it('serves rating + reviews for a fresh connected row', async () => {
      repo.findByProfileId.mockResolvedValue(
        cacheRow({
          reviews: [
            { author: 'A', authorUrl: null, profilePhotoUrl: null, rating: 5, relativeTime: 'now', text: 'great', time: 1 },
          ],
        }),
      );
      const result = await googleReviewsService.get(CALLER);
      expect(result.connection?.status).toBe('connected');
      expect(result.connection?.rating).toBe(4.8);
      expect(result.reviews).toHaveLength(1);
    });

    it('applies the 30-day ToS guard: stale rows serve no content', async () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      repo.findByProfileId.mockResolvedValue(
        cacheRow({
          lastFetchedAt: fortyDaysAgo,
          reviews: [
            { author: 'A', authorUrl: null, profilePhotoUrl: null, rating: 5, relativeTime: 'old', text: 'x', time: 1 },
          ],
        }),
      );
      const result = await googleReviewsService.get(CALLER);
      expect(result.connection?.status).toBe('stale');
      expect(result.connection?.rating).toBeNull();
      expect(result.reviews).toEqual([]);
    });
  });
});
