export {
  SEARCH_COLLECTION_KINDS,
  assertSearchConfig,
  designersCollection,
  initialSearchCollectionName,
  projectsCollection,
  searchBootstrapClient,
  searchClient,
  searchCollectionName,
  searchSynonymSetName,
  type SearchCollectionKind,
} from './client.js';
export type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';
export {
  bootstrapSearch,
  type SearchBootstrapClient,
  type SearchBootstrapResult,
} from './bootstrap.js';
export {
  DESIGNER_DEFAULT_SORT,
  DESIGNER_QUERY_BY,
  DESIGNER_SEARCH_SETTINGS,
  PROJECT_DEFAULT_SORT,
  PROJECT_QUERY_BY,
  PROJECT_SEARCH_SETTINGS,
  searchCollectionSchema,
} from './settings.js';
export { SEARCH_SYNONYMS, SEARCH_SYNONYM_SET } from './synonyms.js';
