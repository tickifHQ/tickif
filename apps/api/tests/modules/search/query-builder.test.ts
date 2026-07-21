import { describe, it, expect } from 'vitest';
import { buildFilterExpression, buildMeiliSort } from '../../../src/modules/search/query-builder.js';

describe('buildFilterExpression', () => {
  it('returns empty string when no filters provided', () => {
    expect(buildFilterExpression({})).toBe('');
  });

  it('returns empty string when all filter arrays are empty', () => {
    expect(buildFilterExpression({ citySlug: [], themes: [] })).toBe('');
  });

  it('builds single-value filter without parentheses', () => {
    expect(buildFilterExpression({ citySlug: ['mumbai'] })).toBe('citySlug = "mumbai"');
  });

  it('builds multi-value filter with OR and parentheses', () => {
    expect(buildFilterExpression({ citySlug: ['mumbai', 'pune'] })).toBe(
      '(citySlug = "mumbai" OR citySlug = "pune")',
    );
  });

  it('combines multiple facets with AND', () => {
    const result = buildFilterExpression({
      citySlug: ['mumbai'],
      bhkSlug: ['3-bhk'],
    });
    expect(result).toBe('citySlug = "mumbai" AND bhkSlug = "3-bhk"');
  });

  it('combines OR within facet and AND across facets', () => {
    const result = buildFilterExpression({
      citySlug: ['mumbai', 'pune'],
      themes: ['modern', 'minimal'],
      budgetBandSlug: ['premium'],
    });
    expect(result).toBe(
      '(citySlug = "mumbai" OR citySlug = "pune") AND (themes = "modern" OR themes = "minimal") AND budgetBandSlug = "premium"',
    );
  });

  it('skips undefined values in the filter map', () => {
    const result = buildFilterExpression({
      citySlug: ['mumbai'],
      localitySlug: undefined,
      themes: ['modern'],
    });
    expect(result).toBe('citySlug = "mumbai" AND themes = "modern"');
  });

  it('handles many facets simultaneously', () => {
    const result = buildFilterExpression({
      citySlug: ['mumbai'],
      localitySlug: ['bandra', 'andheri'],
      propertyTypeSlug: ['apartment'],
      bhkSlug: ['2-bhk', '3-bhk'],
      budgetBandSlug: ['10-20l'],
      themes: ['modern'],
      roomSlugs: ['living-room'],
    });
    expect(result).toContain('citySlug = "mumbai"');
    expect(result).toContain('(localitySlug = "bandra" OR localitySlug = "andheri")');
    expect(result).toContain('(bhkSlug = "2-bhk" OR bhkSlug = "3-bhk")');
    expect(result.split(' AND ').length).toBe(7);
  });

  it('escapes double quotes in filter values', () => {
    const result = buildFilterExpression({ citySlug: ['my "city"'] });
    expect(result).toBe('citySlug = "my \\"city\\""');
  });

  it('escapes backslashes in filter values', () => {
    const result = buildFilterExpression({ themes: ['path\\to'] });
    expect(result).toBe('themes = "path\\\\to"');
  });
});

describe('buildMeiliSort', () => {
  it('returns empty array for relevance (no explicit sort)', () => {
    expect(buildMeiliSort('relevance')).toEqual([]);
  });

  it('passes through publishedAt:desc', () => {
    expect(buildMeiliSort('publishedAt:desc')).toEqual(['publishedAt:desc']);
  });

  it('passes through publishedAt:asc', () => {
    expect(buildMeiliSort('publishedAt:asc')).toEqual(['publishedAt:asc']);
  });

  it('passes through sizeSqft:asc', () => {
    expect(buildMeiliSort('sizeSqft:asc')).toEqual(['sizeSqft:asc']);
  });

  it('passes through avgRating:desc for designer search', () => {
    expect(buildMeiliSort('avgRating:desc')).toEqual(['avgRating:desc']);
  });
});
