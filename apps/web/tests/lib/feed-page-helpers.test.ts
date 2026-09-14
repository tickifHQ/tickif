import { describe, expect, it } from 'vitest';
import {
  canonicalFeedParams,
  feedFilterCardPlacementSeed,
  feedFilterSuggestions,
  feedPageLink,
  searchLabelMaps,
} from '../../src/lib/feed-page-helpers';

const options = {
  city: [{ slug: 'mumbai', label: 'Mumbai' }],
  bhk: [
    { slug: '3-bhk', label: '3 BHK' },
    { slug: '2-bhk', label: '2 BHK' },
  ],
  propertyType: [],
  scope: [],
  budgetBand: [
    { slug: '5-15l', label: '₹5L - ₹15L' },
    { slug: '15-35l', label: '₹15L - ₹35L' },
  ],
  room: [{ slug: 'living-room', label: 'Living Room' }],
  theme: [{ slug: 'modern', label: 'Modern' }],
};

describe('feed-page-helpers', () => {
  it('keeps pagination links on the given base', () => {
    expect(feedPageLink({ q: 'villa' }, 2, '/home')).toBe('/home?q=villa&page=2');
    expect(feedPageLink({}, 1, '/home')).toBe('/home');
    expect(feedPageLink({ q: 'villa' }, 2)).toBe('/?q=villa&page=2');
  });

  it('canonicalizes params the same way for both feed pages', () => {
    expect(canonicalFeedParams({ q: 'villa', city: 'mumbai', page: '3' }, 1)).toEqual({
      q: 'villa',
      city: 'mumbai',
    });
  });

  it('points filter suggestions at the given base', () => {
    const [suggestion] = feedFilterSuggestions(options, {}, { base: '/home', random: () => 0 });
    expect(suggestion?.href).toBe('/home?budgetBand=5-15l');
    expect(suggestion?.label).toBe('₹5L - ₹15L');
    expect(suggestion?.facet).toBe('budgetBand');
  });

  it('uses multiple categories and only suggests options with live matching projects', () => {
    expect(
      feedFilterSuggestions(
        options,
        { city: 'mumbai' },
        {
          facetDistribution: {
            budgetBandSlug: { '5-15l': 0, '15-35l': 7 },
            themes: { modern: 9 },
            roomSlugs: { 'living-room': 5 },
            bhkSlug: { '3-bhk': 3, '2-bhk': 2 },
            citySlug: { mumbai: 18 },
          },
          random: () => 0,
        },
      ),
    ).toEqual([
      {
        href: '/?city=mumbai&budgetBand=15-35l',
        label: '₹15L - ₹35L',
        facet: 'budgetBand',
        facetLabel: 'Budget',
        resultCount: 7,
      },
      {
        href: '/?city=mumbai&theme=modern',
        label: 'Modern',
        facet: 'theme',
        facetLabel: 'Theme',
        resultCount: 9,
      },
      {
        href: '/?city=mumbai&room=living-room',
        label: 'Living Room',
        facet: 'room',
        facetLabel: 'Room',
        resultCount: 5,
      },
      {
        href: '/?city=mumbai&bhk=3-bhk',
        label: '3 BHK',
        facet: 'bhk',
        facetLabel: 'BHK',
        resultCount: 3,
      },
      {
        href: '/?city=mumbai&bhk=2-bhk',
        label: '2 BHK',
        facet: 'bhk',
        facetLabel: 'BHK',
        resultCount: 2,
      },
    ]);
  });

  it('varies the selected value within a category instead of pinning its top option', () => {
    const suggestions = feedFilterSuggestions(
      options,
      {},
      {
        facetDistribution: { bhkSlug: { '3-bhk': 8, '2-bhk': 4 } },
        random: () => 0.99,
      },
    );

    expect(suggestions.find((suggestion) => suggestion.facet === 'bhk')?.label).toBe('2 BHK');
  });

  it('creates a bounded placement seed from the supplied random source', () => {
    expect(feedFilterCardPlacementSeed(() => 0)).toBe(0);
    expect(feedFilterCardPlacementSeed(() => 0.5)).toBe(0x8000_0000);
    expect(feedFilterCardPlacementSeed(() => 0.999_999)).toBeLessThan(0x1_0000_0000);
  });

  it('preserves active criteria and replaces only the suggested category', () => {
    const suggestions = feedFilterSuggestions(
      options,
      {
        q: 'warm home',
        city: 'mumbai',
        theme: 'classic',
        page: '3',
      },
      { random: () => 0 },
    );

    expect(suggestions.find((suggestion) => suggestion.facet === 'theme')?.href).toBe(
      '/?q=warm+home&city=mumbai&theme=modern',
    );
  });

  it('builds label maps for the feed request', () => {
    expect(searchLabelMaps(options)).toEqual({
      cityLabelsBySlug: { mumbai: 'Mumbai' },
      bhkLabelsBySlug: { '3-bhk': '3 BHK', '2-bhk': '2 BHK' },
      budgetLabelsBySlug: { '5-15l': '₹5L - ₹15L', '15-35l': '₹15L - ₹35L' },
      themeLabelsBySlug: { modern: 'Modern' },
    });
  });
});
