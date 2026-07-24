import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (declared before importing the job module) ---

class FakeGooglePlacesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

const places = vi.hoisted(() => ({ fetchPlaceDetails: vi.fn() }));
const queue = vi.hoisted(() => ({ enqueueGoogleReviewsRefresh: vi.fn() }));
const repo = vi.hoisted(() => ({
  getPlaceId: vi.fn(),
  persistResult: vi.fn(),
  persistError: vi.fn(),
  findDueForRefresh: vi.fn(),
  purgeExpired: vi.fn(),
}));

vi.mock('@repo/google-places', () => ({
  fetchPlaceDetails: places.fetchPlaceDetails,
  GooglePlacesError: FakeGooglePlacesError,
}));
vi.mock('@repo/queue', () => ({ enqueueGoogleReviewsRefresh: queue.enqueueGoogleReviewsRefresh }));
vi.mock('../../src/google-reviews/repository.js', () => repo);

const { processGoogleReviewRefresh, processGoogleReviewSweep } = await import(
  '../../src/jobs/google-reviews.js'
);

const DETAILS = {
  placeId: 'ChIJabc',
  name: 'Studio',
  rating: 4.5,
  userRatingsTotal: 20,
  url: null,
  reviews: [],
};

describe('processGoogleReviewRefresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches and persists a successful result', async () => {
    repo.getPlaceId.mockResolvedValue('ChIJabc');
    places.fetchPlaceDetails.mockResolvedValue(DETAILS);

    await processGoogleReviewRefresh('profile-1');

    expect(places.fetchPlaceDetails).toHaveBeenCalledWith('ChIJabc');
    expect(repo.persistResult).toHaveBeenCalledWith('profile-1', DETAILS);
    expect(repo.persistError).not.toHaveBeenCalled();
  });

  it('is a no-op when the profile has no linked place (disconnected mid-flight)', async () => {
    repo.getPlaceId.mockResolvedValue(null);

    await processGoogleReviewRefresh('profile-1');

    expect(places.fetchPlaceDetails).not.toHaveBeenCalled();
    expect(repo.persistResult).not.toHaveBeenCalled();
  });

  it('parks a terminal error (not_found) without rethrowing', async () => {
    repo.getPlaceId.mockResolvedValue('ChIJabc');
    places.fetchPlaceDetails.mockRejectedValue(new FakeGooglePlacesError('not_found', 'gone'));

    await expect(processGoogleReviewRefresh('profile-1')).resolves.toBeUndefined();
    expect(repo.persistError).toHaveBeenCalledWith('profile-1', 'gone');
  });

  it('rethrows a transient error (network) so BullMQ retries', async () => {
    repo.getPlaceId.mockResolvedValue('ChIJabc');
    places.fetchPlaceDetails.mockRejectedValue(new FakeGooglePlacesError('network', 'timeout'));

    await expect(processGoogleReviewRefresh('profile-1')).rejects.toMatchObject({ code: 'network' });
    expect(repo.persistError).toHaveBeenCalledWith('profile-1', 'timeout');
  });

  it('rethrows a rate-limit error so BullMQ backs off and retries', async () => {
    repo.getPlaceId.mockResolvedValue('ChIJabc');
    places.fetchPlaceDetails.mockRejectedValue(new FakeGooglePlacesError('rate_limited', 'quota'));

    await expect(processGoogleReviewRefresh('profile-1')).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });
});

describe('processGoogleReviewSweep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('purges expired rows then enqueues a refresh for each due profile', async () => {
    repo.purgeExpired.mockResolvedValue(2);
    repo.findDueForRefresh.mockResolvedValue(['p1', 'p2', 'p3']);

    const result = await processGoogleReviewSweep();

    expect(repo.purgeExpired).toHaveBeenCalledTimes(1);
    expect(queue.enqueueGoogleReviewsRefresh).toHaveBeenCalledTimes(3);
    expect(queue.enqueueGoogleReviewsRefresh).toHaveBeenCalledWith({ profileId: 'p2' });
    expect(result).toEqual({ purged: 2, enqueued: 3 });
  });

  it('enqueues nothing when no rows are due', async () => {
    repo.purgeExpired.mockResolvedValue(0);
    repo.findDueForRefresh.mockResolvedValue([]);

    const result = await processGoogleReviewSweep();

    expect(queue.enqueueGoogleReviewsRefresh).not.toHaveBeenCalled();
    expect(result).toEqual({ purged: 0, enqueued: 0 });
  });
});
