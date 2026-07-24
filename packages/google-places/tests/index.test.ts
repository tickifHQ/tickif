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

/** Stub fetch with a 200 JSON body; returns the mock for call assertions. */
function mockOk(body: unknown) {
  const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

/** Stub fetch with a non-OK status + New-API error envelope. */
function mockErr(status: number, message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({ error: { message } }),
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

  it('falls back to Text Search (New) for free text', async () => {
    const fetchMock = mockOk({ places: [{ id: PLACE_ID }] });
    await expect(resolvePlaceId('Studio Aakar, Bengaluru')).resolves.toBe(PLACE_ID);

    // Locks the New-API contract: POST places:searchText with key + field-mask headers.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('places.googleapis.com/v1/places:searchText');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBeTruthy();
    expect(headers['X-Goog-FieldMask']).toBe('places.id');
  });

  it('throws not_found when Text Search returns no places', async () => {
    mockOk({ places: [] });
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
    const fetchMock = mockOk({
      id: PLACE_ID,
      displayName: { text: 'Studio Aakar' },
      rating: 4.8,
      userRatingCount: 132,
      googleMapsUri: 'https://maps.google.com/?cid=123',
      reviews: [
        {
          rating: 5,
          relativePublishTimeDescription: 'a week ago',
          text: { text: 'Fantastic work on our home.' },
          authorAttribution: {
            displayName: 'Asha',
            uri: 'https://example.com/asha',
            photoUri: 'https://example.com/asha.jpg',
          },
          publishTime: '2023-11-14T22:13:20Z',
        },
      ],
    });

    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details).toMatchObject({
      placeId: PLACE_ID,
      name: 'Studio Aakar',
      rating: 4.8,
      userRatingsTotal: 132,
      url: 'https://maps.google.com/?cid=123',
    });
    expect(details.reviews).toHaveLength(1);
    expect(details.reviews[0]).toMatchObject({
      author: 'Asha',
      authorUrl: 'https://example.com/asha',
      profilePhotoUrl: 'https://example.com/asha.jpg',
      rating: 5,
      text: 'Fantastic work on our home.',
      time: Math.floor(Date.parse('2023-11-14T22:13:20Z') / 1000),
    });

    // GET place details with the required field mask.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`places.googleapis.com/v1/places/${PLACE_ID}`);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('reviews');
  });

  it('caps reviews at the Google limit', async () => {
    const reviews = Array.from({ length: 8 }, (_, i) => ({
      rating: 4,
      relativePublishTimeDescription: 'now',
      text: { text: 'ok' },
      authorAttribution: { displayName: `R${i}` },
      publishTime: '2024-01-01T00:00:00Z',
    }));
    mockOk({ rating: 4, userRatingCount: 8, reviews });

    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details.reviews).toHaveLength(MAX_GOOGLE_REVIEWS);
  });

  it('handles a place with no ratings yet', async () => {
    mockOk({ displayName: { text: 'New Studio' } });
    const details = await fetchPlaceDetails(PLACE_ID);
    expect(details.name).toBe('New Studio');
    expect(details.rating).toBeNull();
    expect(details.userRatingsTotal).toBeNull();
    expect(details.reviews).toEqual([]);
  });

  it('maps a 403 onto request_denied', async () => {
    mockErr(403, 'API key not authorized');
    await expect(fetchPlaceDetails(PLACE_ID)).rejects.toMatchObject({ code: 'request_denied' });
  });

  it('maps a 404 onto not_found', async () => {
    mockErr(404, 'place not found');
    await expect(fetchPlaceDetails(PLACE_ID)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('maps a 429 onto rate_limited', async () => {
    mockErr(429, 'quota exceeded');
    await expect(fetchPlaceDetails(PLACE_ID)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('treats a 5xx as a transient network error', async () => {
    mockErr(503, 'backend error');
    await expect(fetchPlaceDetails(PLACE_ID)).rejects.toMatchObject({ code: 'network' });
  });
});
