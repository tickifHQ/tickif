import type { Settings } from 'meilisearch';
import { SEARCH_SYNONYMS } from './synonyms.js';

const DEFAULT_RANKING_RULES = ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'];

export const PROJECT_SEARCH_SETTINGS = {
  searchableAttributes: [
    'title',
    'description',
    'designerName',
    'citySlug',
    'localitySlug',
    'propertyTypeSlug',
    'propertySubtypeSlug',
    'scopeSlug',
    'bhkSlug',
    'budgetBandSlug',
    'themes',
    'materials',
    'finishes',
    'roomSlugs',
    'roomLabels',
    'tags',
  ],
  filterableAttributes: [
    'designerId',
    'citySlug',
    'localitySlug',
    'propertyTypeSlug',
    'propertySubtypeSlug',
    'scopeSlug',
    'bhkSlug',
    'budgetBandSlug',
    'themes',
    'materials',
    'finishes',
    'roomSlugs',
  ],
  sortableAttributes: ['publishedAt', 'sizeSqft', 'featuredAt'],
  rankingRules: [...DEFAULT_RANKING_RULES, 'publishedAt:desc'],
  synonyms: SEARCH_SYNONYMS,
} satisfies Settings;

export const DESIGNER_SEARCH_SETTINGS = {
  searchableAttributes: [
    'displayName',
    'bio',
    'citySlugs',
    'localitySlugs',
    'scopeSlugs',
    'themeSlugs',
  ],
  filterableAttributes: ['entityType', 'citySlugs', 'localitySlugs', 'scopeSlugs', 'themeSlugs'],
  sortableAttributes: ['avgRating', 'reviewCount', 'projectCount', 'yearsExperience', 'updatedAt'],
  rankingRules: DEFAULT_RANKING_RULES,
  synonyms: SEARCH_SYNONYMS,
} satisfies Settings;
