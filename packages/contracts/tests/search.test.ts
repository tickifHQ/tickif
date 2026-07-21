import { describe, expect, it } from 'vitest';
import {
  searchQuerySchema,
  suggestQuerySchema,
  designerSearchQuerySchema,
} from '../src/search.js';

describe('searchQuerySchema', () => {
  it('applies defaults when no params provided', () => {
    const parsed = searchQuerySchema.parse({});
    expect(parsed).toMatchObject({ q: '', page: 1, limit: 24, sort: 'relevance' });
  });

  it('coerces string pagination values', () => {
    const parsed = searchQuerySchema.parse({ page: '3', limit: '12' });
    expect(parsed).toMatchObject({ page: 3, limit: 12 });
  });

  it('rejects q longer than 200 characters', () => {
    const result = searchQuerySchema.safeParse({ q: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 48', () => {
    const result = searchQuerySchema.safeParse({ limit: 49 });
    expect(result.success).toBe(false);
  });

  it('rejects page below 1', () => {
    const result = searchQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('normalizes single filter value to array', () => {
    const parsed = searchQuerySchema.parse({ citySlug: ['mumbai'] });
    expect(parsed.citySlug).toEqual(['mumbai']);
  });

  it('passes through array filter values', () => {
    const parsed = searchQuerySchema.parse({ citySlug: ['mumbai', 'pune'] });
    expect(parsed.citySlug).toEqual(['mumbai', 'pune']);
  });

  it('accepts all valid sort options', () => {
    const sorts = ['relevance', 'publishedAt:desc', 'publishedAt:asc', 'sizeSqft:asc', 'sizeSqft:desc'] as const;
    for (const sort of sorts) {
      expect(searchQuerySchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it('rejects invalid sort option', () => {
    const result = searchQuerySchema.safeParse({ sort: 'createdAt:desc' });
    expect(result.success).toBe(false);
  });

  it('accepts multiple filter facets simultaneously', () => {
    const parsed = searchQuerySchema.parse({
      q: 'modern living',
      citySlug: ['mumbai', 'pune'],
      bhkSlug: ['3-bhk'],
      themes: ['modern', 'minimal'],
      budgetBandSlug: ['premium'],
    });
    expect(parsed.citySlug).toEqual(['mumbai', 'pune']);
    expect(parsed.bhkSlug).toEqual(['3-bhk']);
    expect(parsed.themes).toEqual(['modern', 'minimal']);
    expect(parsed.budgetBandSlug).toEqual(['premium']);
  });

  it('rejects page * limit exceeding 1000', () => {
    const result = searchQuerySchema.safeParse({ page: 22, limit: 48 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('pagination');
    }
  });

  it('accepts page * limit at exactly 1000', () => {
    const parsed = searchQuerySchema.parse({ page: 25, limit: 40 });
    expect(parsed.page).toBe(25);
    expect(parsed.limit).toBe(40);
  });
});

describe('suggestQuerySchema', () => {
  it('requires q to be at least 1 character', () => {
    const result = suggestQuerySchema.safeParse({ q: '' });
    expect(result.success).toBe(false);
  });

  it('rejects q longer than 200 characters', () => {
    const result = suggestQuerySchema.safeParse({ q: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('accepts valid query', () => {
    const parsed = suggestQuerySchema.parse({ q: 'modern kitchen' });
    expect(parsed.q).toBe('modern kitchen');
  });
});

describe('designerSearchQuerySchema', () => {
  it('applies defaults', () => {
    const parsed = designerSearchQuerySchema.parse({});
    expect(parsed).toMatchObject({ q: '', page: 1, limit: 24, sort: 'relevance' });
  });

  it('accepts entityType filter', () => {
    const parsed = designerSearchQuerySchema.parse({ entityType: 'company' });
    expect(parsed.entityType).toBe('company');
  });

  it('rejects invalid entityType', () => {
    const result = designerSearchQuerySchema.safeParse({ entityType: 'freelancer' });
    expect(result.success).toBe(false);
  });

  it('accepts designer-specific sort options', () => {
    const sorts = ['relevance', 'avgRating:desc', 'projectCount:desc', 'reviewCount:desc', 'yearsExperience:desc'] as const;
    for (const sort of sorts) {
      expect(designerSearchQuerySchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it('normalizes citySlugs filter to array', () => {
    const parsed = designerSearchQuerySchema.parse({ citySlugs: ['mumbai'] });
    expect(parsed.citySlugs).toEqual(['mumbai']);
  });

  it('rejects page * limit exceeding 1000', () => {
    const result = designerSearchQuerySchema.safeParse({ page: 30, limit: 48 });
    expect(result.success).toBe(false);
  });
});
