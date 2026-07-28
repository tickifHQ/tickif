import { describe, expect, it } from 'vitest';
import {
  initialSearchCollectionName,
  searchCollectionName,
  searchSynonymSetName,
} from '../src/client.js';
import {
  DESIGNER_SEARCH_SETTINGS,
  PROJECT_DEFAULT_SORT,
  PROJECT_SEARCH_SETTINGS,
} from '../src/settings.js';
import { SEARCH_SYNONYMS } from '../src/synonyms.js';

describe('search collection configuration', () => {
  it('names collections and the shared synonym set through the environment prefix', () => {
    expect(searchCollectionName('projects', 'tickif_test')).toBe('tickif_test_projects');
    expect(searchCollectionName('designers', 'tickif_test')).toBe('tickif_test_designers');
    expect(initialSearchCollectionName('projects', 'tickif_test')).toBe(
      'tickif_test_projects_v1',
    );
    expect(searchSynonymSetName('tickif_test')).toBe('tickif_test_search_synonyms');
  });

  it('keeps publishedAt as the final project ranking tiebreak', () => {
    expect(PROJECT_DEFAULT_SORT).toBe('_text_match:desc,publishedAt:desc');
    expect(PROJECT_SEARCH_SETTINGS.default_sorting_field).toBeUndefined();
    expect(PROJECT_SEARCH_SETTINGS.token_separators).toEqual(['-']);
    expect(PROJECT_SEARCH_SETTINGS.fields).toContainEqual(
      expect.objectContaining({ name: 'publishedAt', type: 'int64', sort: true }),
    );
  });

  it('configures the facets used by the public query API', () => {
    expect(PROJECT_SEARCH_SETTINGS.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'citySlug', facet: true }),
        expect.objectContaining({ name: 'budgetBandSlug', facet: true }),
        expect.objectContaining({ name: 'themes', facet: true }),
      ]),
    );
    expect(DESIGNER_SEARCH_SETTINGS.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'entityType', facet: true }),
        expect.objectContaining({ name: 'citySlugs', facet: true }),
        expect.objectContaining({ name: 'themeSlugs', facet: true }),
      ]),
    );
  });

  it('keeps required regional terms in multi-way synonym groups', () => {
    expect(SEARCH_SYNONYMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ synonyms: expect.arrayContaining(['bengaluru', 'bangalore']) }),
        expect.objectContaining({ synonyms: expect.arrayContaining(['washroom', 'bathroom']) }),
        expect.objectContaining({ synonyms: expect.arrayContaining(['hall', 'living-room']) }),
      ]),
    );
  });
});
