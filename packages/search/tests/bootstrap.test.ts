import type {
  CollectionAliasCreateSchema,
  CollectionAliasSchema,
  CollectionCreateSchema,
  CollectionFieldSchema,
  CollectionSchema,
  CollectionUpdateSchema,
  SynonymSetCreateSchema,
} from 'typesense';
import { Errors } from 'typesense';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapSearch, type SearchBootstrapClient } from '../src/bootstrap.js';
import {
  initialSearchCollectionName,
  searchCollectionName,
  searchSynonymSetName,
} from '../src/client.js';
import { SEARCH_SYNONYM_SET } from '../src/synonyms.js';

const projectAliasName = searchCollectionName('projects');
const designerAliasName = searchCollectionName('designers');
const projectCollectionName = initialSearchCollectionName('projects');
const designerCollectionName = initialSearchCollectionName('designers');
const synonymSetName = searchSynonymSetName();

function notFound(): Error {
  return new Errors.ObjectNotFound('Object not found', undefined, 404);
}

function alreadyExists(): Error {
  return new Errors.ObjectAlreadyExists('Object already exists', undefined, 409);
}

function storedCollection(schema: CollectionCreateSchema): CollectionSchema {
  return {
    name: schema.name,
    fields: schema.fields.map((field) => ({ ...field })),
    default_sorting_field: schema.default_sorting_field ?? '',
    symbols_to_index: schema.symbols_to_index ?? [],
    token_separators: schema.token_separators ?? [],
    enable_nested_fields: schema.enable_nested_fields ?? false,
    metadata: schema.metadata ?? {},
    voice_query_model: schema.voice_query_model ?? {},
    synonym_sets: schema.synonym_sets ?? [],
    curation_sets: schema.curation_sets ?? [],
    created_at: 1,
    num_documents: 0,
    num_memory_shards: 4,
  };
}

function applyCollectionUpdate(
  current: CollectionSchema,
  update: CollectionUpdateSchema,
): CollectionSchema {
  const unsupportedKeys = Object.keys(update).filter(
    (key) => key !== 'fields' && key !== 'synonym_sets',
  );
  if (unsupportedKeys.length > 0) {
    throw new Error(`Unsupported collection update keys: ${unsupportedKeys.join(', ')}`);
  }

  const fields = new Map(current.fields.map((field) => [field.name, field]));
  for (const field of update.fields ?? []) {
    if ('drop' in field) fields.delete(field.name);
    else fields.set(field.name, field);
  }

  return {
    ...current,
    synonym_sets: update.synonym_sets ?? current.synonym_sets,
    fields: [...fields.values()],
  };
}

function fakeClient() {
  const collections = new Map<string, CollectionSchema>();
  const aliases = new Map<string, CollectionAliasSchema>();
  const synonymSets = new Map<string, SynonymSetCreateSchema>();

  const createCollection = vi.fn(async (schema: CollectionCreateSchema) => {
    if (collections.has(schema.name)) throw alreadyExists();
    const stored = storedCollection(schema);
    collections.set(schema.name, stored);
    return stored;
  });
  const updateCollection = vi.fn(
    async (name: string, update: CollectionUpdateSchema) => {
      const current = collections.get(name);
      if (!current) throw notFound();
      const stored = applyCollectionUpdate(current, update);
      collections.set(name, stored);
      return stored;
    },
  );
  const upsertSynonymSet = vi.fn(
    async (name: string, synonymSet: SynonymSetCreateSchema) => {
      const stored = structuredClone(synonymSet);
      synonymSets.set(name, stored);
      return stored;
    },
  );
  const upsertAlias = vi.fn(async (name: string, alias: CollectionAliasCreateSchema) => {
    const stored = { name, ...alias };
    aliases.set(name, stored);
    return stored;
  });

  const client: SearchBootstrapClient = {
    health: vi.fn(async () => ({ ok: true })),
    getCollection: vi.fn(async (name: string) => {
      const collection = collections.get(name);
      if (!collection) throw notFound();
      return collection;
    }),
    createCollection,
    updateCollection,
    getAlias: vi.fn(async (name: string) => {
      const alias = aliases.get(name);
      if (!alias) throw notFound();
      return alias;
    }),
    upsertAlias,
    getSynonymSet: vi.fn(async (name: string) => {
      const synonymSet = synonymSets.get(name);
      if (!synonymSet) throw notFound();
      return synonymSet;
    }),
    upsertSynonymSet,
  };

  return {
    client,
    collections,
    aliases,
    synonymSets,
    createCollection,
    updateCollection,
    upsertSynonymSet,
    upsertAlias,
  };
}

describe('bootstrapSearch', () => {
  it('creates both collections and the synonym set, then performs no writes on a second pass', async () => {
    const fake = fakeClient();

    await expect(bootstrapSearch({ client: fake.client })).resolves.toEqual({
      createdCollections: [projectCollectionName, designerCollectionName],
      updatedCollections: [],
      createdAliases: [projectAliasName, designerAliasName],
      updatedSynonymSet: true,
    });
    expect(fake.createCollection).toHaveBeenCalledTimes(2);
    expect(fake.upsertSynonymSet).toHaveBeenCalledTimes(1);

    await expect(bootstrapSearch({ client: fake.client })).resolves.toEqual({
      createdCollections: [],
      updatedCollections: [],
      createdAliases: [],
      updatedSynonymSet: false,
    });
    expect(fake.createCollection).toHaveBeenCalledTimes(2);
    expect(fake.updateCollection).not.toHaveBeenCalled();
    expect(fake.upsertSynonymSet).toHaveBeenCalledTimes(1);
    expect(fake.upsertAlias).toHaveBeenCalledTimes(2);
  });

  it('reports missing configuration in check mode without mutating Typesense', async () => {
    const fake = fakeClient();

    await expect(bootstrapSearch({ client: fake.client, check: true })).rejects.toThrow(
      `Search configuration drift: synonym set ${synonymSetName} does not exist`,
    );
    expect(fake.createCollection).not.toHaveBeenCalled();
    expect(fake.updateCollection).not.toHaveBeenCalled();
    expect(fake.upsertSynonymSet).not.toHaveBeenCalled();
  });

  it('repairs collection schema and synonym drift', async () => {
    const fake = fakeClient();
    await bootstrapSearch({ client: fake.client });

    const projects = fake.collections.get(projectCollectionName);
    if (!projects) throw new Error('Expected projects collection');
    const city = projects.fields.find((field) => field.name === 'citySlug');
    if (!city) throw new Error('Expected citySlug field');
    city.facet = false;

    const synonymSet = fake.synonymSets.get(synonymSetName);
    if (!synonymSet) throw new Error('Expected synonym set');
    synonymSet.items = synonymSet.items.slice(1);

    await expect(bootstrapSearch({ client: fake.client })).rejects.toThrow(
      'run bootstrap with --apply-updates',
    );
    expect(fake.updateCollection).not.toHaveBeenCalled();

    await expect(
      bootstrapSearch({ client: fake.client, applyUpdates: true }),
    ).resolves.toEqual({
      createdCollections: [],
      updatedCollections: [projectCollectionName],
      createdAliases: [],
      updatedSynonymSet: true,
    });
    expect(fake.updateCollection).toHaveBeenCalledWith(
      projectCollectionName,
      expect.objectContaining({
        fields: expect.arrayContaining([
          { name: 'citySlug', drop: true },
          expect.objectContaining({ name: 'citySlug', facet: true }),
        ]) as CollectionFieldSchema[],
      }),
    );
  });

  it('drops fields that are no longer present in the checked-in schema', async () => {
    const fake = fakeClient();
    await bootstrapSearch({ client: fake.client });

    const projects = fake.collections.get(projectCollectionName);
    if (!projects) throw new Error('Expected projects collection');
    projects.fields.push({ name: 'legacyField', type: 'string', optional: true });

    await expect(
      bootstrapSearch({ client: fake.client, applyUpdates: true }),
    ).resolves.toEqual({
      createdCollections: [],
      updatedCollections: [projectCollectionName],
      createdAliases: [],
      updatedSynonymSet: false,
    });
    expect(fake.updateCollection).toHaveBeenCalledWith(projectCollectionName, {
      fields: [{ name: 'legacyField', drop: true }],
    });
  });

  it('requires a versioned rebuild instead of patching immutable collection settings', async () => {
    const fake = fakeClient();
    await bootstrapSearch({ client: fake.client });

    const projects = fake.collections.get(projectCollectionName);
    if (!projects) throw new Error('Expected projects collection');
    projects.token_separators = ['_'];

    await expect(
      bootstrapSearch({ client: fake.client, applyUpdates: true }),
    ).rejects.toThrow('requires a versioned collection rebuild');
    expect(fake.updateCollection).not.toHaveBeenCalled();
  });

  it('ignores server-only synonym properties while detecting supported drift', async () => {
    const fake = fakeClient();
    await bootstrapSearch({ client: fake.client });

    const synonymSet = fake.synonymSets.get(synonymSetName);
    if (!synonymSet) throw new Error('Expected synonym set');
    const first = synonymSet.items[0];
    if (!first) throw new Error('Expected synonym item');
    Object.assign(first, { locale: '', server_generated: true });

    await expect(bootstrapSearch({ client: fake.client, check: true })).resolves.toEqual({
      createdCollections: [],
      updatedCollections: [],
      createdAliases: [],
      updatedSynonymSet: false,
    });

    first.locale = 'hi';
    await expect(bootstrapSearch({ client: fake.client, check: true })).rejects.toThrow(
      'does not match checked-in configuration',
    );
  });

  it('accepts a collection created concurrently by another API replica', async () => {
    const fake = fakeClient();
    await fake.client.upsertSynonymSet(synonymSetName, SEARCH_SYNONYM_SET);
    fake.upsertSynonymSet.mockClear();

    fake.createCollection.mockImplementationOnce(async (schema) => {
      fake.collections.set(schema.name, storedCollection(schema));
      throw alreadyExists();
    });

    await expect(bootstrapSearch({ client: fake.client })).resolves.toEqual({
      createdCollections: [designerCollectionName],
      updatedCollections: [],
      createdAliases: [projectAliasName, designerAliasName],
      updatedSynonymSet: false,
    });
  });

  it('validates the physical collection currently selected by an existing alias', async () => {
    const fake = fakeClient();
    await bootstrapSearch({ client: fake.client });

    const rebuiltName = `${projectAliasName}_20260723`;
    const current = fake.collections.get(projectCollectionName);
    if (!current) throw new Error('Expected projects collection');
    fake.collections.set(rebuiltName, { ...current, name: rebuiltName });
    fake.aliases.set(projectAliasName, {
      name: projectAliasName,
      collection_name: rebuiltName,
    });

    await expect(bootstrapSearch({ client: fake.client, check: true })).resolves.toEqual({
      createdCollections: [],
      updatedCollections: [],
      createdAliases: [],
      updatedSynonymSet: false,
    });
    expect(fake.upsertAlias).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite an alias created while bootstrap is preparing a collection', async () => {
    const fake = fakeClient();
    await fake.client.upsertSynonymSet(synonymSetName, SEARCH_SYNONYM_SET);
    fake.upsertSynonymSet.mockClear();

    const rebuiltName = `${projectAliasName}_v2`;
    fake.createCollection.mockImplementationOnce(async (schema) => {
      const stored = storedCollection(schema);
      fake.collections.set(schema.name, stored);
      fake.collections.set(rebuiltName, { ...stored, name: rebuiltName });
      fake.aliases.set(projectAliasName, {
        name: projectAliasName,
        collection_name: rebuiltName,
      });
      return stored;
    });

    await bootstrapSearch({ client: fake.client });

    expect(fake.aliases.get(projectAliasName)?.collection_name).toBe(rebuiltName);
    expect(fake.upsertAlias).toHaveBeenCalledTimes(1);
    expect(fake.upsertAlias).toHaveBeenCalledWith(designerAliasName, {
      collection_name: designerCollectionName,
    });
  });

  it('fails bootstrap when Typesense reports an unhealthy node', async () => {
    const fake = fakeClient();
    fake.client.health = vi.fn(async () => ({ ok: false }));

    await expect(bootstrapSearch({ client: fake.client })).rejects.toThrow(
      'Typesense is not healthy',
    );
  });
});
