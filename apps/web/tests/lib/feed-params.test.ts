import { describe, expect, it } from 'vitest';
import {
  parseFeedParams,
  serializeFeedParams,
  toDiscoveryFeedFilters,
  toFeedProjectsFilters,
} from '../../src/lib/feed-params';

describe('feed params', () => {
  it('round-trips comma-separated and repeated URL values', () => {
    const parsed = parseFeedParams(
      new URLSearchParams('city=bengaluru,pune&city=pune&bhk=3bhk&other=ignored'),
    );

    expect(parsed.city).toEqual(['bengaluru', 'pune']);
    expect(parsed.bhk).toEqual(['3bhk']);
    expect(serializeFeedParams(parsed).toString()).toBe('city=bengaluru%2Cpune&bhk=3bhk');
  });

  it('preserves unrelated query parameters while replacing feed filters', () => {
    const state = parseFeedParams(new URLSearchParams('city=mumbai&theme=modern'));
    const params = serializeFeedParams(
      { ...state, city: ['pune'], theme: [] },
      new URLSearchParams('q=living&page=2&city=mumbai&theme=modern'),
    );

    expect(params.toString()).toBe('q=living&page=2&city=pune');
  });

  it('maps URL state to typed discovery filter keys', () => {
    const filters = toDiscoveryFeedFilters(
      parseFeedParams(
        new URLSearchParams('city=mumbai,pune&room=living-room&theme=modern,minimalist'),
      ),
    );

    expect(filters).toEqual({
      citySlug: ['mumbai', 'pune'],
      roomSlugs: 'living-room',
      themes: ['modern', 'minimalist'],
    });
  });

  it('maps URL state to the server-rendered project feed query', () => {
    const filters = toFeedProjectsFilters(
      parseFeedParams(new URLSearchParams('city=mumbai,pune&propertyType=residential')),
    );

    expect(filters).toEqual({
      citySlug: ['mumbai', 'pune'],
      propertyTypeSlug: 'residential',
    });
  });
});
