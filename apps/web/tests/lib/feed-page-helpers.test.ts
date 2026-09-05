import { describe, expect, it } from 'vitest';
import {
  budgetSuggestions,
  canonicalFeedParams,
  feedPageLink,
  searchLabelMaps,
} from '../../src/lib/feed-page-helpers';

const options = {
  city: [{ slug: 'mumbai', label: 'Mumbai' }],
  bhk: [],
  propertyType: [],
  scope: [],
  budgetBand: [{ slug: '15-35l', label: '₹15L - ₹35L' }],
  room: [],
  theme: [],
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

  it('points budget suggestions at the given base', () => {
    const [suggestion] = budgetSuggestions(options, {}, '/home');
    expect(suggestion?.href).toBe('/home?budgetBand=15-35l');
    expect(suggestion?.label).toBe('₹15L - ₹35L');
  });

  it('builds label maps for the feed request', () => {
    expect(searchLabelMaps(options)).toEqual({
      cityLabelsBySlug: { mumbai: 'Mumbai' },
      bhkLabelsBySlug: {},
      budgetLabelsBySlug: { '15-35l': '₹15L - ₹35L' },
      themeLabelsBySlug: {},
    });
  });
});
