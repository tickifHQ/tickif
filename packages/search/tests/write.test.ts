import type {
  CollectionAliasCreateSchema,
  CollectionAliasSchema,
  CollectionCreateSchema,
  CollectionSchema,
  ImportResponse,
} from 'typesense';
import { Errors } from 'typesense';
import { describe, expect, it, vi } from 'vitest';
import { searchCollectionName } from '../src/client.js';
import type { ProjectSearchDocument } from '../src/documents.js';
import {
  createSearchCollection,
  deleteSearchCollection,
  deleteSearchDocument,
  deleteSearchProjectsByDesigner,
  getSearchCollectionTarget,
  importSearchDocuments,
  type SearchDocument,
  SearchDocumentImportError,
  swapSearchCollectionAlias,
  type SearchWriteOperations,
  upsertSearchDocument,
} from '../src/write.js';

const projectAlias = searchCollectionName('projects');
const designerAlias = searchCollectionName('designers');
const projectCollection = `${projectAlias}_v20260728`;
const designerCollection = `${designerAlias}_v20260728`;

const projectDocument: ProjectSearchDocument = {
  id: 'project-1',
  slug: 'quiet-home',
  title: 'Quiet home',
  description: null,
  designerId: 'designer-1',
  designerSlug: 'studio-one',
  designerName: 'Studio One',
  citySlug: 'mumbai',
  localitySlug: null,
  propertyTypeSlug: 'apartment',
  propertySubtypeSlug: null,
  scopeSlug: 'full-home',
  bhkSlug: '3-bhk',
  budgetBandSlug: null,
  sizeSqft: 1500,
  themes: ['minimal'],
  materials: ['wood'],
  finishes: [],
  roomSlugs: ['living-room'],
  roomLabels: ['Living room'],
  tags: [],
  coverImageKey: 'projects/project-1/cover-medium.webp',
  publishedAt: 1_785_000_000_000,
  featuredAt: null,
  avgRating: 4.5,
  reviewCount: 12,
};

function collectionSchema(name: string): CollectionSchema {
  return {
    name,
    fields: [],
    default_sorting_field: '',
    symbols_to_index: [],
    token_separators: [],
    enable_nested_fields: false,
    metadata: {},
    voice_query_model: {},
    synonym_sets: [],
    curation_sets: [],
    created_at: 1,
    num_documents: 0,
    num_memory_shards: 4,
  };
}

function fakeOperations() {
  const createCollection = vi.fn(async (schema: CollectionCreateSchema) =>
    collectionSchema(schema.name),
  );
  const importDocuments = vi.fn(
    async (
      _collectionName: string,
      documents: SearchDocument[],
    ): Promise<ImportResponse<SearchDocument>[]> =>
      documents.map((document) => ({ success: true, id: document.id })),
  );
  const upsertDocument = vi.fn(
    async (_collectionName: string, _document: SearchDocument) => undefined,
  );
  const deleteDocument = vi.fn(async () => undefined);
  const deleteDocumentsByFilter = vi.fn(async () => ({ num_deleted: 0 }));
  const getAlias = vi.fn(
    async (name: string): Promise<CollectionAliasSchema> => ({
      name,
      collection_name: `${projectAlias}_v1`,
    }),
  );
  const upsertAlias = vi.fn(
    async (name: string, alias: CollectionAliasCreateSchema): Promise<CollectionAliasSchema> => ({
      name,
      ...alias,
    }),
  );
  const deleteCollection = vi.fn(async (name: string) => collectionSchema(name));

  const operations: SearchWriteOperations = {
    createCollection,
    importDocuments,
    upsertDocument,
    deleteDocument,
    deleteDocumentsByFilter,
    getAlias,
    upsertAlias,
    deleteCollection,
  };

  return {
    operations,
    createCollection,
    importDocuments,
    upsertDocument,
    deleteDocument,
    deleteDocumentsByFilter,
    getAlias,
    upsertAlias,
    deleteCollection,
  };
}

function notFound(): Error {
  return new Errors.ObjectNotFound('Object not found', undefined, 404);
}

describe('search write primitives', () => {
  it('creates a physical collection from the checked-in schema', async () => {
    const fake = fakeOperations();

    await createSearchCollection('projects', projectCollection, {
      client: fake.operations,
    });

    expect(fake.createCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        name: projectCollection,
        fields: expect.arrayContaining([
          expect.objectContaining({ name: 'publishedAt', type: 'int64' }),
        ]) as CollectionCreateSchema['fields'],
      }),
    );
  });

  it('upserts through the stable alias unless a physical collection is provided', async () => {
    const fake = fakeOperations();

    await upsertSearchDocument('projects', projectDocument, {
      client: fake.operations,
    });
    await upsertSearchDocument('projects', projectDocument, {
      client: fake.operations,
      collectionName: projectCollection,
    });

    expect(fake.upsertDocument).toHaveBeenNthCalledWith(1, projectAlias, projectDocument);
    expect(fake.upsertDocument).toHaveBeenNthCalledWith(2, projectCollection, projectDocument);
  });

  it('validates every row returned by a bulk import', async () => {
    const fake = fakeOperations();
    fake.importDocuments.mockResolvedValueOnce([
      { success: true, id: 'project-1' },
      {
        success: false,
        id: 'project-2',
        code: 400,
        error: 'Field `title` must be a string.',
      },
    ]);

    await expect(
      importSearchDocuments(
        'projects',
        projectCollection,
        [projectDocument, { ...projectDocument, id: 'project-2' }],
        { client: fake.operations },
      ),
    ).rejects.toMatchObject({
      name: 'SearchDocumentImportError',
      collectionName: projectCollection,
      failures: [
        {
          row: 1,
          id: 'project-2',
          code: 400,
          error: 'Field `title` must be a string.',
        },
      ],
    });
  });

  it('rejects an incomplete bulk-import response', async () => {
    const fake = fakeOperations();
    fake.importDocuments.mockResolvedValueOnce([{ success: true, id: 'project-1' }]);

    const promise = importSearchDocuments(
      'projects',
      projectCollection,
      [projectDocument, { ...projectDocument, id: 'project-2' }],
      { client: fake.operations },
    );

    await expect(promise).rejects.toBeInstanceOf(SearchDocumentImportError);
    await expect(promise).rejects.toMatchObject({
      failures: [
        {
          row: 1,
          id: 'project-2',
          code: 0,
          error: 'Typesense returned no result for this row.',
        },
      ],
    });
  });

  it('treats deleting an absent document as an idempotent success', async () => {
    const fake = fakeOperations();
    fake.deleteDocument.mockRejectedValueOnce(notFound());

    await expect(
      deleteSearchDocument('projects', 'project-1', { client: fake.operations }),
    ).resolves.toBe(false);
    await expect(
      deleteSearchDocument('projects', 'project-1', { client: fake.operations }),
    ).resolves.toBe(true);
  });

  it('deletes every project document belonging to a designer', async () => {
    const fake = fakeOperations();
    fake.deleteDocumentsByFilter.mockResolvedValueOnce({ num_deleted: 3 });

    await expect(
      deleteSearchProjectsByDesigner('designer-1', { client: fake.operations }),
    ).resolves.toBe(3);
    expect(fake.deleteDocumentsByFilter).toHaveBeenCalledWith(
      projectAlias,
      'designerId:=`designer-1`',
    );
  });

  it('returns the previous target when atomically replacing an alias', async () => {
    const fake = fakeOperations();

    await expect(
      swapSearchCollectionAlias('projects', projectCollection, {
        client: fake.operations,
      }),
    ).resolves.toEqual({
      aliasName: projectAlias,
      previousCollectionName: `${projectAlias}_v1`,
      collectionName: projectCollection,
    });
    expect(fake.upsertAlias).toHaveBeenCalledWith(projectAlias, {
      collection_name: projectCollection,
    });
    await expect(getSearchCollectionTarget('projects', { client: fake.operations })).resolves.toBe(
      `${projectAlias}_v1`,
    );
  });

  it('only deletes versioned physical collections belonging to the selected kind', async () => {
    const fake = fakeOperations();

    await deleteSearchCollection('projects', projectCollection, {
      client: fake.operations,
    });

    expect(fake.deleteCollection).toHaveBeenCalledWith(projectCollection);
    await expect(
      deleteSearchCollection('projects', projectAlias, {
        client: fake.operations,
      }),
    ).rejects.toThrow('Refusing to use non-versioned search collection');
    await expect(
      deleteSearchCollection('projects', designerCollection, {
        client: fake.operations,
      }),
    ).rejects.toThrow('Refusing to use non-versioned search collection');
    await expect(
      importSearchDocuments('projects', designerCollection, [], {
        client: fake.operations,
      }),
    ).rejects.toThrow('Refusing to use non-versioned search collection');
    expect(fake.deleteCollection).toHaveBeenCalledTimes(1);
  });
});
