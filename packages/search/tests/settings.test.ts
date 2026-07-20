import { describe, expect, it } from 'vitest';
import { searchIndexName } from '../src/client.js';
import { DESIGNER_SEARCH_SETTINGS, PROJECT_SEARCH_SETTINGS } from '../src/settings.js';
import { SEARCH_SYNONYMS } from '../src/synonyms.js';

describe('search index configuration', () => {
  it('names indexes through the environment prefix', () => {
    expect(searchIndexName('projects', 'tickif_test')).toBe('tickif_test_projects');
    expect(searchIndexName('designers', 'tickif_test')).toBe('tickif_test_designers');
  });

  it('keeps publishedAt as the final project ranking tiebreak', () => {
    expect(PROJECT_SEARCH_SETTINGS.rankingRules).toEqual([
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness',
      'publishedAt:desc',
    ]);
    expect(PROJECT_SEARCH_SETTINGS.sortableAttributes).toContain('publishedAt');
  });

  it('configures the facets used by the public query API', () => {
    expect(PROJECT_SEARCH_SETTINGS.filterableAttributes).toEqual(
      expect.arrayContaining(['citySlug', 'localitySlug', 'budgetBandSlug', 'bhkSlug', 'themes']),
    );
    expect(DESIGNER_SEARCH_SETTINGS.filterableAttributes).toEqual(
      expect.arrayContaining(['entityType', 'citySlugs', 'themeSlugs']),
    );
  });

  it('keeps required regional terms symmetric', () => {
    expect(SEARCH_SYNONYMS.bengaluru).toContain('bangalore');
    expect(SEARCH_SYNONYMS.bangalore).toContain('bengaluru');
    expect(SEARCH_SYNONYMS.washroom).toContain('bathroom');
    expect(SEARCH_SYNONYMS.bathroom).toContain('washroom');
    expect(SEARCH_SYNONYMS.hall).toContain('living-room');
    expect(SEARCH_SYNONYMS['living-room']).toContain('hall');
  });
});
