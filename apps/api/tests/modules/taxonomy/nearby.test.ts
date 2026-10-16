import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  config: { GOOGLE_PLACES_API_KEY: 'test-key' },
  budget: vi.fn(),
  findCity: vi.fn(),
}));
vi.mock('@repo/config', () => ({ config: mock.config, isProduction: false }));
vi.mock('../../../src/lib/redis.js', () => ({ consumeNearbyLookupBudget: mock.budget }));
vi.mock('../../../src/modules/taxonomy/locations-repository.js', () => ({
  locationsRepository: { findCityByLabels: mock.findCity },
}));
import { findNearbyLocation } from '../../../src/modules/taxonomy/nearby-service.js';

const city = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'vapi',
  label: 'Vapi',
  parentId: null,
};
const input = { latitude: 20.37123, longitude: 72.90123 };
const response = {
  results: [
    {
      addressComponents: [
        { longText: 'Vapi', shortText: 'Vapi', types: ['locality'] },
        { longText: 'India', shortText: 'IN', types: ['country'] },
      ],
    },
  ],
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  mock.config.GOOGLE_PLACES_API_KEY = 'test-key';
  mock.budget.mockResolvedValue(true);
  mock.findCity.mockResolvedValue(city);
  fetchMock.mockResolvedValue(Response.json(response));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('nearby city resolution', () => {
  it('matches saved custom cities, rounding coordinates and returning only taxonomy data', async () => {
    expect(await findNearbyLocation(input)).toEqual({ city });
    expect(mock.findCity).toHaveBeenCalledWith(['Vapi']);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain('location.latitude=20.37');
    expect(url).toContain('location.longitude=72.90');
    expect(url).not.toContain('test-key');
  });
  it('fails clearly without a provider key and makes no upstream request', async () => {
    mock.config.GOOGLE_PLACES_API_KEY = '';
    await expect(findNearbyLocation(input)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not spend provider quota when the shared budget is exhausted', async () => {
    mock.budget.mockResolvedValue(false);
    await expect(findNearbyLocation(input)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not create a new city when the detected city is not saved', async () => {
    mock.findCity.mockResolvedValue(null);
    await expect(findNearbyLocation(input)).rejects.toMatchObject({ status: 404 });
  });
  it('does not substitute a foreign location for an Indian city with the same name', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        results: [
          {
            addressComponents: [
              { longText: 'Vapi', types: ['locality'] },
              { longText: 'Other Country', shortText: 'XX', types: ['country'] },
            ],
          },
        ],
      }),
    );
    mock.findCity.mockResolvedValue(null);
    await expect(findNearbyLocation(input)).rejects.toMatchObject({ status: 404 });
    expect(mock.findCity).toHaveBeenCalledWith([]);
  });
  it.each(['http', 'network', 'invalid'])(
    'handles provider %s failures without leaking details',
    async (failure) => {
      if (failure === 'network') fetchMock.mockRejectedValue(new Error('secret upstream URL'));
      else
        fetchMock.mockResolvedValue(
          failure === 'http'
            ? new Response('secret', { status: 403 })
            : Response.json({ results: 'invalid' }),
        );
      await expect(findNearbyLocation(input)).rejects.toMatchObject({ status: 502 });
    },
  );
});
