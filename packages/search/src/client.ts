import { config, isProduction } from '@repo/config';
import { Client } from 'typesense';
import type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';

const LOCAL_API_KEY = 'tickif-local-typesense-key';
type SearchCredentials = Pick<
  typeof config,
  'TYPESENSE_API_KEY' | 'TYPESENSE_SEARCH_API_KEY'
>;

export const SEARCH_COLLECTION_KINDS = ['projects', 'designers'] as const;
export type SearchCollectionKind = (typeof SEARCH_COLLECTION_KINDS)[number];

/** Fail before startup work if production is using the checked-in local credential. */
export function assertSearchConfig(
  credentials: SearchCredentials = config,
  production: boolean = isProduction,
): void {
  if (!production) return;
  if (credentials.TYPESENSE_API_KEY === LOCAL_API_KEY) {
    throw new Error('TYPESENSE_API_KEY must be replaced in production');
  }
  if (credentials.TYPESENSE_SEARCH_API_KEY === LOCAL_API_KEY) {
    throw new Error('TYPESENSE_SEARCH_API_KEY must be replaced in production');
  }
  if (credentials.TYPESENSE_API_KEY === credentials.TYPESENSE_SEARCH_API_KEY) {
    throw new Error('TYPESENSE_SEARCH_API_KEY must be a separate search-only key');
  }
}

export function searchCollectionName(
  kind: SearchCollectionKind,
  prefix: string = config.TYPESENSE_COLLECTION_PREFIX,
): string {
  return `${prefix}_${kind}`;
}

export function initialSearchCollectionName(
  kind: SearchCollectionKind,
  prefix: string = config.TYPESENSE_COLLECTION_PREFIX,
): string {
  return `${searchCollectionName(kind, prefix)}_v1`;
}

export function searchSynonymSetName(
  prefix: string = config.TYPESENSE_COLLECTION_PREFIX,
): string {
  return `${prefix}_search_synonyms`;
}

let client: Client | undefined;
let bootstrapClient: Client | undefined;

/** Lazily constructed so importing document types never opens a network connection. */
export function searchClient(): Client {
  client ??= new Client({
    nodes: [{ url: config.TYPESENSE_HOST }],
    apiKey: config.TYPESENSE_SEARCH_API_KEY,
    connectionTimeoutSeconds: 1,
    numRetries: 1,
    retryIntervalSeconds: 0.1,
  });
  return client;
}

/**
 * Admin client for startup/bootstrap work. Schema alterations are synchronous,
 * so retries are disabled to avoid replaying a long-running request.
 */
export function searchBootstrapClient(): Client {
  bootstrapClient ??= new Client({
    nodes: [{ url: config.TYPESENSE_HOST }],
    apiKey: config.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 120,
    numRetries: 0,
  });
  return bootstrapClient;
}

export function projectsCollection(instance: Client = searchClient()) {
  return instance.collections<ProjectSearchDocument>(searchCollectionName('projects'));
}

export function designersCollection(instance: Client = searchClient()) {
  return instance.collections<DesignerSearchDocument>(searchCollectionName('designers'));
}
