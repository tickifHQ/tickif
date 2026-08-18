import type { CollectionCreateSchema, CollectionFieldSchema } from 'typesense';
import {
  initialSearchCollectionName,
  searchSynonymSetName,
  type SearchCollectionKind,
} from './client.js';

export const PROJECT_QUERY_BY = [
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
] as const;

export const DESIGNER_QUERY_BY = [
  'displayName',
  'bio',
  'citySlugs',
  'localitySlugs',
  'scopeSlugs',
  'themeSlugs',
] as const;

export const PROJECT_DEFAULT_SORT = '_text_match:desc,publishedAt:desc';
export const DESIGNER_DEFAULT_SORT = '_text_match:desc,projectCount:desc';

const PROJECT_COLLECTION_FIELDS = [
  { name: 'slug', type: 'string', index: false, optional: true },
  { name: 'title', type: 'string' },
  { name: 'description', type: 'string', optional: true },
  { name: 'designerId', type: 'string', facet: true },
  { name: 'designerSlug', type: 'string', index: false, optional: true },
  { name: 'designerName', type: 'string' },
  { name: 'citySlug', type: 'string', facet: true, optional: true },
  { name: 'localitySlug', type: 'string', facet: true, optional: true },
  { name: 'propertyTypeSlug', type: 'string', facet: true, optional: true },
  { name: 'propertySubtypeSlug', type: 'string', facet: true, optional: true },
  { name: 'scopeSlug', type: 'string', facet: true, optional: true },
  { name: 'bhkSlug', type: 'string', facet: true, optional: true },
  { name: 'budgetBandSlug', type: 'string', facet: true, optional: true },
  { name: 'sizeSqft', type: 'float', optional: true, sort: true },
  { name: 'themes', type: 'string[]', facet: true },
  { name: 'materials', type: 'string[]', facet: true },
  { name: 'finishes', type: 'string[]', facet: true },
  { name: 'roomSlugs', type: 'string[]', facet: true },
  { name: 'roomLabels', type: 'string[]' },
  { name: 'tags', type: 'string[]' },
  { name: 'coverImageKey', type: 'string', index: false, optional: true },
  { name: 'coverImageId', type: 'string', index: false, optional: true },
  { name: 'coverImageWidth', type: 'int32', index: false, optional: true },
  { name: 'coverImageHeight', type: 'int32', index: false, optional: true },
  { name: 'featuredAt', type: 'int64', sort: true, optional: true },
  { name: 'avgRating', type: 'float', sort: true, optional: true },
  { name: 'reviewCount', type: 'int32', sort: true, optional: true },
  { name: 'publishedAt', type: 'int64', sort: true },
] satisfies CollectionFieldSchema[];

const DESIGNER_COLLECTION_FIELDS = [
  { name: 'slug', type: 'string', index: false, optional: true },
  { name: 'displayName', type: 'string' },
  { name: 'bio', type: 'string', optional: true },
  { name: 'entityType', type: 'string', facet: true },
  { name: 'citySlugs', type: 'string[]', facet: true },
  { name: 'localitySlugs', type: 'string[]', facet: true },
  { name: 'scopeSlugs', type: 'string[]', facet: true },
  { name: 'themeSlugs', type: 'string[]', facet: true },
  { name: 'yearsExperience', type: 'int32', sort: true },
  { name: 'projectCount', type: 'int32', sort: true },
  { name: 'avgRating', type: 'float', sort: true },
  { name: 'reviewCount', type: 'int32', sort: true },
  { name: 'logoImageKey', type: 'string', index: false, optional: true },
  { name: 'updatedAt', type: 'int64', sort: true },
] satisfies CollectionFieldSchema[];

const COLLECTION_FIELDS = {
  projects: PROJECT_COLLECTION_FIELDS,
  designers: DESIGNER_COLLECTION_FIELDS,
} satisfies Record<SearchCollectionKind, CollectionFieldSchema[]>;

export function searchCollectionSchema(
  kind: SearchCollectionKind,
  name: string = initialSearchCollectionName(kind),
): CollectionCreateSchema {
  return {
    name,
    fields: COLLECTION_FIELDS[kind],
    synonym_sets: [searchSynonymSetName()],
    token_separators: ['-'],
  };
}

export const PROJECT_SEARCH_SETTINGS: CollectionCreateSchema =
  searchCollectionSchema('projects');
export const DESIGNER_SEARCH_SETTINGS: CollectionCreateSchema =
  searchCollectionSchema('designers');
