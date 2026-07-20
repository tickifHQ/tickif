export {
  SEARCH_INDEX_KINDS,
  assertSearchConfig,
  designersIndex,
  projectsIndex,
  searchClient,
  searchIndexName,
  type SearchIndexKind,
} from './client.js';
export type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';
export {
  bootstrapSearch,
  type SearchBootstrapClient,
  type SearchBootstrapResult,
} from './bootstrap.js';
export { DESIGNER_SEARCH_SETTINGS, PROJECT_SEARCH_SETTINGS } from './settings.js';
export { SEARCH_SYNONYMS } from './synonyms.js';
