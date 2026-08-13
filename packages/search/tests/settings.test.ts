import { describe, expect, it } from 'vitest';
import {
  initialSearchCollectionName,
  searchCollectionName,
  searchSynonymSetName,
  versionedSearchCollectionName,
} from '../src/client.js';
import {
  DESIGNER_SEARCH_SETTINGS,
  designerDefaultSort,
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
    expect(versionedSearchCollectionName('projects', 1_785_000_000_000, 'tickif_test')).toBe(
      'tickif_test_projects_v1785000000000',
    );
    expect(searchSynonymSetName('tickif_test')).toBe('tickif_test_search_synonyms');
  });

  it('rejects unsafe collection versions', () => {
    expect(() => versionedSearchCollectionName('projects', '')).toThrow(
      'Search collection version must contain only letters, numbers, underscores, or hyphens',
    );
    expect(() => versionedSearchCollectionName('projects', '2026/07/28')).toThrow(
      'Search collection version must contain only letters, numbers, underscores, or hyphens',
    );
    expect(() => versionedSearchCollectionName('projects', Number.NaN)).toThrow(
      'Search collection version must contain only letters, numbers, underscores, or hyphens',
    );
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

  it('boosts only verification approvals that are current at query time', () => {
    expect(designerDefaultSort(1_786_000_000_000)).toBe(
      '_text_match:desc,_eval(isKycVerified:true && kycExpiresAt:>1786000000000):desc,updatedAt:desc',
    );
    expect(DESIGNER_SEARCH_SETTINGS.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'isKycVerified', type: 'bool', sort: true }),
        expect.objectContaining({ name: 'kycExpiresAt', type: 'int64', sort: true }),
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
