import { config, isProduction } from '@repo/config';
import { Meilisearch, type Index } from 'meilisearch';
import type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';

const LOCAL_MASTER_KEY = 'tickif-local-master-key';

export const SEARCH_INDEX_KINDS = ['projects', 'designers'] as const;
export type SearchIndexKind = (typeof SEARCH_INDEX_KINDS)[number];

/** Fail before startup work if production is using the checked-in local credential. */
export function assertSearchConfig(): void {
  if (isProduction && config.MEILI_MASTER_KEY === LOCAL_MASTER_KEY) {
    throw new Error('MEILI_MASTER_KEY must be replaced in production');
  }
}

export function searchIndexName(
  kind: SearchIndexKind,
  prefix: string = config.MEILI_INDEX_PREFIX,
): string {
  return `${prefix}_${kind}`;
}

let client: Meilisearch | undefined;

/** Lazily constructed so importing document types never opens a network connection. */
export function searchClient(): Meilisearch {
  client ??= new Meilisearch({
    host: config.MEILI_HOST,
    apiKey: config.MEILI_MASTER_KEY,
    defaultWaitOptions: { timeout: 30_000, interval: 50 },
  });
  return client;
}

export function projectsIndex(
  instance: Meilisearch = searchClient(),
): Index<ProjectSearchDocument> {
  return instance.index<ProjectSearchDocument>(searchIndexName('projects'));
}

export function designersIndex(
  instance: Meilisearch = searchClient(),
): Index<DesignerSearchDocument> {
  return instance.index<DesignerSearchDocument>(searchIndexName('designers'));
}
