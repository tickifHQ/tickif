import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractPlaceIdFromUrl,
  fetchPlaceDetails,
  GooglePlacesError,
  isGooglePlacesConfigured,
  MAX_GOOGLE_REVIEWS,
  resolvePlaceId,
} from '../src/index.js';

const PLACE_ID = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

/** Build a fetch mock returning one JSON body. */
function mockFetchJson(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isGooglePlacesConfigured', () => {
  it('is true when a key is present (test env sets a dummy key)', () => {
    expect(isGooglePlacesConfigured()).toBe(true);
  });
});

describe('extractPlaceIdFromUrl', () => {
  it('reads place_id from the query string', () => {
    expect(extractPlaceIdFromUrl(`https://maps.google.com/?place_id=${PLACE_ID}`)).toBe(PLACE_ID);
  });

  it('reads place_id from the !1s data segment', () => {
    expect(
      extractPlaceIdFromUrl(`https://www.google.com/maps/place/Studio/data=!4m2!3m1!1s${PLACE_ID}`),
    ).toBe(PLACE_ID);
  });

  it('returns null for a URL without a place-id', () => {
    expect(extractPlaceIdFromUrl('https://maps.google.com/maps/place/Studio')).toBeNull();
  });

  it('returns null for a non-URL', () => {
    expect(extractPlaceIdFromUrl('not a url')).toBeNull();
  });
});

describe('resolvePlaceId', () => {
  it('returns a raw place-id without hitting the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    await expect(resolvePlaceId(PLACE_ID)).resolves.toBe(PLACE_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('extracts from a maps URL without hitting the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    await expect(resolvePlaceId(`https://maps.google.com/?place_id=${PLACE_ID}`)).resolves.toBe(
      PLACE_ID,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to Find Place for free text', async () => {
    mockFetchJson({ status: 'OK', candidates: [{ place_id: PLACE_ID }] });
    await expect(resolvePlaceId('Studio Aakar, Bengaluru')).resolves.toBe(PLACE_ID);
  });

  it('throws not_found when Find Place returns no candidates', async () => {
    mockFetchJson({ status: 'ZERO_RESULTS', candidates: [] });
    await expect(resolvePlaceId('nonexistent studio xyz')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('rejects empty input', async () => {
    await expect(resolvePlaceId('   ')).rejects.toBeInstanceOf(GooglePlacesError);
  });
});

describe('fetchPlaceDetails', () => {
  it('maps aggregate fields and reviews', async () => {
    mockFetchJson({
      status: 'OK',
      result: {
        name: 'Studio Aakar',
        rating: 4.8,
        user_ratings_total: 132,
        url: 'https://maps.google.com/?cid=123',
        reviews: [
          {
            author_name: 'Asha',
            author_url: 'https://example.com/asha',
            profile_photo_url: 'https://example.com/asha.jpg',
            rating: 5,
            relative_time_description: 'a week ago',
            text: 'Fantastic work on our home.',
            time: 1_700_000_000,
          },
        ],
      },
    });

    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details).toMatchObject({
      placeId: PLACE_ID,
      name: 'Studio Aakar',
      rating: 4.8,
      userRatingsTotal: 132,
    });
    expect(details.reviews).toHaveLength(1);
    expect(details.reviews[0]).toMatchObject({ author: 'Asha', rating: 5 });
  });

  it('caps reviews at the Google limit', async () => {
    const reviews = Array.from({ length: 8 }, (_, i) => ({
      author_name: `R${i}`,
      rating: 4,
      relative_time_description: 'now',
      text: 'ok',
      time: i,
    }));
    mockFetchJson({ status: 'OK', result: { rating: 4, user_ratings_total: 8, reviews } });

    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details.reviews).toHaveLength(MAX_GOOGLE_REVIEWS);
  });

  it('handles a place with no ratings yet', async () => {
    mockFetchJson({ status: 'OK', result: { name: 'New Studio' } });
    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details.rating).toBeNull();
    expect(details.userRatingsTotal).toBeNull();
    expect(details.reviews).toEqual([]);
  });

  it('maps REQUEST_DENIED onto request_denied', async () => {
    mockFetchJson({ status: 'REQUEST_DENIED', error_message: 'bad key' });
    await expect(fetchPlaceDetails(PLACE_ID)).rejects.toMatchObject({ code: 'request_denied' });
  });
});
