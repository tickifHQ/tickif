import { isDeepStrictEqual } from 'node:util';
import { assertProductionSearchConfig } from '@repo/config';
import {
  Errors,
  type Client,
  type CollectionAliasCreateSchema,
  type CollectionAliasSchema,
  type CollectionCreateSchema,
  type CollectionFieldSchema,
  type CollectionSchema,
  type CollectionUpdateSchema,
  type HealthResponse,
  type SynonymSetCreateSchema,
} from 'typesense';
import {
  initialSearchCollectionName,
  SEARCH_COLLECTION_KINDS,
  searchBootstrapClient,
  searchCollectionName,
  searchSynonymSetName,
} from './client.js';
import { searchCollectionSchema } from './settings.js';
import { SEARCH_SYNONYM_SET } from './synonyms.js';

export type SearchBootstrapClient = {
  health(): Promise<HealthResponse>;
  getCollection(name: string): Promise<CollectionSchema>;
  createCollection(schema: CollectionCreateSchema): Promise<CollectionSchema>;
  updateCollection(name: string, schema: CollectionUpdateSchema): Promise<CollectionSchema>;
  getAlias(name: string): Promise<CollectionAliasSchema>;
  upsertAlias(
    name: string,
    alias: CollectionAliasCreateSchema,
  ): Promise<CollectionAliasSchema>;
  getSynonymSet(name: string): Promise<SynonymSetCreateSchema>;
  upsertSynonymSet(
    name: string,
    synonymSet: SynonymSetCreateSchema,
  ): Promise<SynonymSetCreateSchema>;
};

export type SearchBootstrapResult = {
  createdCollections: string[];
  updatedCollections: string[];
  createdAliases: string[];
  updatedSynonymSet: boolean;
};

function typesenseBootstrapClient(instance: Client): SearchBootstrapClient {
  return {
    health: () => instance.health.retrieve(),
    getCollection: (name) => instance.collections(name).retrieve(),
    createCollection: (schema) => instance.collections().create(schema),
    updateCollection: (name, schema) => instance.collections(name).update(schema),
    getAlias: (name) => instance.aliases(name).retrieve(),
    upsertAlias: (name, alias) => instance.aliases().upsert(name, alias),
    getSynonymSet: (name) => instance.synonymSets(name).retrieve(),
    upsertSynonymSet: (name, synonymSet) =>
      instance.synonymSets(name).upsert(synonymSet),
  };
}

function httpStatus(error: unknown): number | undefined {
  if (error instanceof Errors.TypesenseError) return error.httpStatus;
  if (typeof error !== 'object' || error === null || !('httpStatus' in error)) return undefined;
  return typeof error.httpStatus === 'number' ? error.httpStatus : undefined;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Errors.ObjectNotFound || httpStatus(error) === 404;
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Errors.ObjectAlreadyExists || httpStatus(error) === 409;
}

function defaultSortable(type: CollectionFieldSchema['type']): boolean {
  return ['int32', 'int64', 'float'].includes(type);
}

function normalizedField(field: CollectionFieldSchema) {
  return {
    name: field.name,
    type: field.type,
    optional: field.optional ?? false,
    facet: field.facet ?? false,
    index: field.index ?? true,
    sort: field.sort ?? defaultSortable(field.type),
    infix: field.infix ?? false,
    stem: field.stem ?? false,
    locale: field.locale || undefined,
    num_dim: field.num_dim || undefined,
    store: field.store ?? true,
    range_index: field.range_index ?? false,
  };
}

function normalizedSchema(schema: CollectionCreateSchema | CollectionSchema) {
  return {
    fields: schema.fields.map(normalizedField).sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    default_sorting_field: schema.default_sorting_field ?? '',
    synonym_sets: [...(schema.synonym_sets ?? [])].sort(),
    token_separators: [...(schema.token_separators ?? [])].sort(),
    symbols_to_index: [...(schema.symbols_to_index ?? [])].sort(),
    enable_nested_fields: schema.enable_nested_fields ?? false,
  };
}

function normalizedSynonymSet(synonymSet: SynonymSetCreateSchema) {
  return {
    items: synonymSet.items
      .map((item) => ({
        id: item.id,
        root: item.root || undefined,
        synonyms: [...item.synonyms].sort(),
        locale: item.locale || undefined,
        symbols_to_index: item.symbols_to_index
          ? [...item.symbols_to_index].sort()
          : undefined,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function immutableCollectionDrift(
  current: CollectionSchema,
  expected: CollectionCreateSchema,
): string[] {
  const differences: string[] = [];
  if (
    (current.default_sorting_field ?? '') !==
    (expected.default_sorting_field ?? '')
  ) {
    differences.push('default_sorting_field');
  }
  if (
    !isDeepStrictEqual(
      [...(current.token_separators ?? [])].sort(),
      [...(expected.token_separators ?? [])].sort(),
    )
  ) {
    differences.push('token_separators');
  }
  if (
    !isDeepStrictEqual(
      [...(current.symbols_to_index ?? [])].sort(),
      [...(expected.symbols_to_index ?? [])].sort(),
    )
  ) {
    differences.push('symbols_to_index');
  }
  if (
    (current.enable_nested_fields ?? false) !==
    (expected.enable_nested_fields ?? false)
  ) {
    differences.push('enable_nested_fields');
  }
  return differences;
}

function collectionUpdate(
  current: CollectionSchema,
  expected: CollectionCreateSchema,
): CollectionUpdateSchema {
  const fields: NonNullable<CollectionUpdateSchema['fields']> = [];
  const currentFields = new Map(current.fields.map((field) => [field.name, field]));
  const expectedFields = new Map(expected.fields.map((field) => [field.name, field]));

  for (const field of current.fields) {
    const next = expectedFields.get(field.name);
    if (!next) {
      fields.push({ name: field.name, drop: true });
      continue;
    }
    if (!isDeepStrictEqual(normalizedField(field), normalizedField(next))) {
      fields.push({ name: field.name, drop: true }, next);
    }
  }

  for (const field of expected.fields) {
    if (!currentFields.has(field.name)) fields.push(field);
  }

  const update: CollectionUpdateSchema = {};
  if (fields.length > 0) update.fields = fields;
  if (
    !isDeepStrictEqual(
      [...(current.synonym_sets ?? [])].sort(),
      [...(expected.synonym_sets ?? [])].sort(),
    )
  ) {
    update.synonym_sets = expected.synonym_sets ?? [];
  }
  return update;
}

async function ensureSynonymSet(
  instance: SearchBootstrapClient,
  check: boolean,
  applyUpdates: boolean,
): Promise<boolean> {
  const name = searchSynonymSetName();
  let current: SynonymSetCreateSchema | undefined;

  try {
    current = await instance.getSynonymSet(name);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  if (
    current &&
    isDeepStrictEqual(
      normalizedSynonymSet(current),
      normalizedSynonymSet(SEARCH_SYNONYM_SET),
    )
  ) {
    return false;
  }

  if (check || (current && !applyUpdates)) {
    throw new Error(
      `Search configuration drift: synonym set ${name} ${
        current ? 'does not match checked-in configuration' : 'does not exist'
      }${current && !check ? '; run bootstrap with --apply-updates' : ''}`,
    );
  }

  await instance.upsertSynonymSet(name, SEARCH_SYNONYM_SET);
  return true;
}

async function ensureCollection(
  instance: SearchBootstrapClient,
  expected: CollectionCreateSchema,
  check: boolean,
  applyUpdates: boolean,
): Promise<{ created: boolean; updated: boolean }> {
  let current: CollectionSchema | undefined;

  try {
    current = await instance.getCollection(expected.name);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  if (!current) {
    if (check) {
      throw new Error(`Search configuration drift: collection ${expected.name} does not exist`);
    }

    try {
      await instance.createCollection(expected);
      return { created: true, updated: false };
    } catch (error) {
      // Multiple API replicas may bootstrap concurrently. A competing create
      // is equivalent to success; every other failure remains fatal.
      if (!isAlreadyExists(error)) throw error;
      current = await instance.getCollection(expected.name);
    }
  }

  if (isDeepStrictEqual(normalizedSchema(current), normalizedSchema(expected))) {
    return { created: false, updated: false };
  }

  const immutableDrift = immutableCollectionDrift(current, expected);
  if (immutableDrift.length > 0) {
    throw new Error(
      `Search configuration drift: collection ${expected.name} has immutable changes (${immutableDrift.join(
        ', ',
      )}) and requires a versioned collection rebuild`,
    );
  }

  if (check || !applyUpdates) {
    throw new Error(
      `Search configuration drift: collection ${expected.name} does not match checked-in schema${
        check ? '' : '; run bootstrap with --apply-updates'
      }`,
    );
  }

  await instance.updateCollection(expected.name, collectionUpdate(current, expected));
  return { created: false, updated: true };
}

export async function bootstrapSearch(
  options: {
    applyUpdates?: boolean;
    check?: boolean;
    client?: SearchBootstrapClient;
  } = {},
): Promise<SearchBootstrapResult> {
  assertProductionSearchConfig();
  const instance = options.client ?? typesenseBootstrapClient(searchBootstrapClient());
  const health = await instance.health();
  if (!health.ok) throw new Error('Typesense is not healthy');

  const check = options.check ?? false;
  const applyUpdates = options.applyUpdates ?? false;
  const result: SearchBootstrapResult = {
    createdCollections: [],
    updatedCollections: [],
    createdAliases: [],
    updatedSynonymSet: await ensureSynonymSet(instance, check, applyUpdates),
  };

  for (const kind of SEARCH_COLLECTION_KINDS) {
    const aliasName = searchCollectionName(kind);
    let collectionName: string;
    let aliasExists = true;

    try {
      collectionName = (await instance.getAlias(aliasName)).collection_name;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      if (check) {
        throw new Error(`Search configuration drift: collection alias ${aliasName} does not exist`);
      }
      aliasExists = false;
      collectionName = initialSearchCollectionName(kind);
    }

    const outcome = await ensureCollection(
      instance,
      searchCollectionSchema(kind, collectionName),
      check,
      applyUpdates,
    );
    if (outcome.created) result.createdCollections.push(collectionName);
    if (outcome.updated) result.updatedCollections.push(collectionName);

    if (!aliasExists) {
      // A rebuild may have installed an alias while this process prepared the
      // initial collection. Re-check so bootstrap never points it back to v1.
      let aliasCreatedElsewhere = false;
      try {
        await instance.getAlias(aliasName);
        aliasCreatedElsewhere = true;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }

      if (!aliasCreatedElsewhere) {
        await instance.upsertAlias(aliasName, { collection_name: collectionName });
        result.createdAliases.push(aliasName);
      }
    }
  }

  return result;
}
