export {
  SEARCH_COLLECTION_KINDS,
  designersCollection,
  initialSearchCollectionName,
  projectsCollection,
  searchBootstrapClient,
  searchClient,
  searchCollectionName,
  searchSynonymSetName,
  searchWriteClient,
  versionedSearchCollectionName,
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
export {
  createSearchCollection,
  deleteSearchCollection,
  deleteSearchDocument,
  getSearchCollectionTarget,
  importSearchDocuments,
  SearchDocumentImportError,
  swapSearchCollectionAlias,
  upsertSearchDocument,
  type SearchDocument,
  type SearchDocumentImportFailure,
  type SearchDocumentsByKind,
  type SearchWriteOperations,
} from './write.js';
