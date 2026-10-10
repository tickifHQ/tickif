import { describe, expect, it } from 'vitest';
import { visitorFeedHref, visitorSearchFilters } from '../../src/lib/visitor-feed-preferences';

const city = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'chennai',
  label: 'Chennai',
  parentId: null,
};
const locality = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'adyar',
  label: 'Adyar',
  parentId: city.id,
};
describe('visitor feed search mapping', () => {
  it('uses shareable city, locality and BHK parameters', () => {
    expect(visitorFeedHref({ homeType: '3-bhk', city, locality })).toBe(
      '/home?city=chennai&locality=adyar&bhk=3-bhk',
    );
  });
  it('includes both four-bedroom taxonomy groups for 4 BHK+', () => {
    expect(visitorSearchFilters({ homeType: '4-plus-bhk', city, locality: null })).toEqual({
      citySlug: 'chennai',
      bhkSlug: ['4-bhk', '4-plus-bhk'],
    });
  });
  it('uses the villa subtype without inventing a BHK', () => {
    expect(visitorFeedHref({ homeType: 'villa', city, locality: null })).toBe(
      '/home?city=chennai&propertySubtype=villa',
    );
  });
  it('falls back to the general feed for skipped or removed locations', () => {
    expect(visitorFeedHref({ homeType: null, city: null, locality: null })).toBe('/home');
    expect(visitorFeedHref({ homeType: '3-bhk', city: null, locality: null })).toBe('/home');
  });
});
