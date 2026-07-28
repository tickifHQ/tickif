import {
  Errors,
  type Client,
  type CollectionAliasCreateSchema,
  type CollectionAliasSchema,
  type CollectionCreateSchema,
  type CollectionSchema,
  type ImportResponse,
} from 'typesense';
import { searchCollectionName, searchWriteClient, type SearchCollectionKind } from './client.js';
import type { DesignerSearchDocument, ProjectSearchDocument } from './documents.js';
import { searchCollectionSchema } from './settings.js';

export type SearchDocumentsByKind = {
  projects: ProjectSearchDocument;
  designers: DesignerSearchDocument;
};

export type SearchDocument = SearchDocumentsByKind[SearchCollectionKind];

export type SearchWriteOperations = {
  createCollection(schema: CollectionCreateSchema): Promise<CollectionSchema>;
  importDocuments(
    collectionName: string,
    documents: SearchDocument[],
  ): Promise<ImportResponse<SearchDocument>[]>;
  upsertDocument(collectionName: string, document: SearchDocument): Promise<void>;
  deleteDocument(collectionName: string, documentId: string): Promise<void>;
  deleteDocumentsByFilter(
    collectionName: string,
    filterBy: string,
  ): Promise<{ num_deleted: number }>;
  getAlias(name: string): Promise<CollectionAliasSchema>;
  upsertAlias(name: string, alias: CollectionAliasCreateSchema): Promise<CollectionAliasSchema>;
  deleteCollection(name: string): Promise<CollectionSchema>;
};

export type SearchDocumentImportFailure = {
  row: number;
  id?: string;
  code: number;
  error: string;
};

export class SearchDocumentImportError extends Error {
  readonly collectionName: string;
  readonly failures: SearchDocumentImportFailure[];

  constructor(collectionName: string, failures: SearchDocumentImportFailure[]) {
    super(
      `Failed to import ${failures.length} search document${
        failures.length === 1 ? '' : 's'
      } into ${collectionName}`,
    );
    this.name = 'SearchDocumentImportError';
    this.collectionName = collectionName;
    this.failures = failures;
  }
}

function typesenseWriteOperations(instance: Client): SearchWriteOperations {
  return {
    createCollection: (schema) => instance.collections().create(schema),
    importDocuments: (collectionName, documents) =>
      instance.collections<SearchDocument>(collectionName).documents().import(documents, {
        action: 'upsert',
        dirty_values: 'reject',
        return_id: true,
        throwOnFail: false,
      }),
    upsertDocument: async (collectionName, document) => {
      await instance.collections<SearchDocument>(collectionName).documents().upsert(document, {
        dirty_values: 'reject',
      });
    },
    deleteDocument: async (collectionName, documentId) => {
      await instance.collections(collectionName).documents(documentId).delete();
    },
    deleteDocumentsByFilter: (collectionName, filterBy) =>
      instance.collections(collectionName).documents().delete({ filter_by: filterBy }),
    getAlias: (name) => instance.aliases(name).retrieve(),
    upsertAlias: (name, alias) => instance.aliases().upsert(name, alias),
    deleteCollection: (name) => instance.collections(name).delete(),
  };
}

function writeOperations(client?: SearchWriteOperations): SearchWriteOperations {
  return client ?? typesenseWriteOperations(searchWriteClient());
}

function httpStatus(error: unknown): number | undefined {
  if (error instanceof Errors.TypesenseError) return error.httpStatus;
  if (typeof error !== 'object' || error === null || !('httpStatus' in error)) {
    return undefined;
  }
  return typeof error.httpStatus === 'number' ? error.httpStatus : undefined;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Errors.ObjectNotFound || httpStatus(error) === 404;
}

function assertVersionedCollectionName(kind: SearchCollectionKind, collectionName: string): void {
  const prefix = `${searchCollectionName(kind)}_v`;
  const version = collectionName.slice(prefix.length);
  if (!collectionName.startsWith(prefix) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(version)) {
    throw new Error(`Refusing to use non-versioned search collection ${collectionName}`);
  }
}

export async function createSearchCollection(
  kind: SearchCollectionKind,
  collectionName: string,
  options: { client?: SearchWriteOperations } = {},
): Promise<CollectionSchema> {
  assertVersionedCollectionName(kind, collectionName);
  return writeOperations(options.client).createCollection(
    searchCollectionSchema(kind, collectionName),
  );
}

export async function upsertSearchDocument<K extends SearchCollectionKind>(
  kind: K,
  document: SearchDocumentsByKind[K],
  options: {
    client?: SearchWriteOperations;
    collectionName?: string;
  } = {},
): Promise<SearchDocumentsByKind[K]> {
  const collectionName = options.collectionName ?? searchCollectionName(kind);
  if (options.collectionName) {
    assertVersionedCollectionName(kind, collectionName);
  }
  await writeOperations(options.client).upsertDocument(collectionName, document);
  return document;
}

export async function importSearchDocuments<K extends SearchCollectionKind>(
  kind: K,
  collectionName: string,
  documents: SearchDocumentsByKind[K][],
  options: { client?: SearchWriteOperations } = {},
): Promise<void> {
  assertVersionedCollectionName(kind, collectionName);
  if (documents.length === 0) return;

  const results = await writeOperations(options.client).importDocuments(collectionName, documents);
  const failures: SearchDocumentImportFailure[] = [];

  for (const [row, result] of results.entries()) {
    if (!result.success) {
      const id = result.id ?? documents[row]?.id;
      failures.push({
        row,
        ...(id === undefined ? {} : { id }),
        code: result.code,
        error: result.error,
      });
    }
  }

  for (let row = results.length; row < documents.length; row += 1) {
    const id = documents[row]?.id;
    failures.push({
      row,
      ...(id === undefined ? {} : { id }),
      code: 0,
      error: 'Typesense returned no result for this row.',
    });
  }

  if (results.length > documents.length) {
    failures.push({
      row: documents.length,
      code: 0,
      error: 'Typesense returned unexpected additional import results.',
    });
  }

  if (failures.length > 0) {
    throw new SearchDocumentImportError(collectionName, failures);
  }
}

export async function deleteSearchDocument(
  kind: SearchCollectionKind,
  documentId: string,
  options: {
    client?: SearchWriteOperations;
    collectionName?: string;
  } = {},
): Promise<boolean> {
  const collectionName = options.collectionName ?? searchCollectionName(kind);
  if (options.collectionName) {
    assertVersionedCollectionName(kind, collectionName);
  }
  try {
    await writeOperations(options.client).deleteDocument(collectionName, documentId);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function deleteSearchProjectsByDesigner(
  designerId: string,
  options: {
    client?: SearchWriteOperations;
    collectionName?: string;
  } = {},
): Promise<number> {
  const collectionName = options.collectionName ?? searchCollectionName('projects');
  if (options.collectionName) {
    assertVersionedCollectionName('projects', collectionName);
  }
  const escapedDesignerId = designerId.replace(/`/g, '\\`');
  const result = await writeOperations(options.client).deleteDocumentsByFilter(
    collectionName,
    `designerId:=\`${escapedDesignerId}\``,
  );
  return result.num_deleted;
}

export async function getSearchCollectionTarget(
  kind: SearchCollectionKind,
  options: { client?: SearchWriteOperations } = {},
): Promise<string> {
  return (await writeOperations(options.client).getAlias(searchCollectionName(kind)))
    .collection_name;
}

export async function swapSearchCollectionAlias(
  kind: SearchCollectionKind,
  collectionName: string,
  options: { client?: SearchWriteOperations } = {},
): Promise<{
  aliasName: string;
  previousCollectionName: string;
  collectionName: string;
}> {
  assertVersionedCollectionName(kind, collectionName);
  const client = writeOperations(options.client);
  const aliasName = searchCollectionName(kind);
  const previousCollectionName = (await client.getAlias(aliasName)).collection_name;
  await client.upsertAlias(aliasName, { collection_name: collectionName });
  return { aliasName, previousCollectionName, collectionName };
}

export async function deleteSearchCollection(
  kind: SearchCollectionKind,
  collectionName: string,
  options: { client?: SearchWriteOperations } = {},
): Promise<CollectionSchema> {
  assertVersionedCollectionName(kind, collectionName);
  return writeOperations(options.client).deleteCollection(collectionName);
}
