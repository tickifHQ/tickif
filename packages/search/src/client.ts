import { config } from '@repo/config';
import { Client } from 'typesense';
import type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';

export const SEARCH_COLLECTION_KINDS = ['projects', 'designers'] as const;
export type SearchCollectionKind = (typeof SEARCH_COLLECTION_KINDS)[number];

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
  return versionedSearchCollectionName(kind, 1, prefix);
}

export function versionedSearchCollectionName(
  kind: SearchCollectionKind,
  version: string | number,
  prefix: string = config.TYPESENSE_COLLECTION_PREFIX,
): string {
  const value = String(version);
  const invalidNumber =
    typeof version === 'number' &&
    (!Number.isSafeInteger(version) || version < 0);
  if (invalidNumber || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(
      'Search collection version must contain only letters, numbers, underscores, or hyphens',
    );
  }
  return `${searchCollectionName(kind, prefix)}_v${value}`;
}

export function searchSynonymSetName(
  prefix: string = config.TYPESENSE_COLLECTION_PREFIX,
): string {
  return `${prefix}_search_synonyms`;
}

let client: Client | undefined;
let bootstrapClient: Client | undefined;
let writeClient: Client | undefined;

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

/** Admin client for steady-state document writes and bounded rebuild operations. */
export function searchWriteClient(): Client {
  writeClient ??= new Client({
    nodes: [{ url: config.TYPESENSE_HOST }],
    apiKey: config.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 5,
    numRetries: 3,
    retryIntervalSeconds: 0.25,
  });
  return writeClient;
}

export function projectsCollection(instance: Client = searchClient()) {
  return instance.collections<ProjectSearchDocument>(searchCollectionName('projects'));
}

export function designersCollection(instance: Client = searchClient()) {
  return instance.collections<DesignerSearchDocument>(searchCollectionName('designers'));
}
