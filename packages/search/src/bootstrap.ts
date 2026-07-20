import { isDeepStrictEqual } from 'node:util';
import {
  MeilisearchApiError,
  type EnqueuedTask,
  type Health,
  type Settings,
  type Task,
} from 'meilisearch';
import {
  assertSearchConfig,
  searchClient,
  searchIndexName,
  type SearchIndexKind,
} from './client.js';
import { DESIGNER_SEARCH_SETTINGS, PROJECT_SEARCH_SETTINGS } from './settings.js';

const MANAGED_SETTINGS = {
  projects: PROJECT_SEARCH_SETTINGS,
  designers: DESIGNER_SEARCH_SETTINGS,
} satisfies Record<SearchIndexKind, Settings>;

type SearchSettingsIndex = {
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<EnqueuedTask>;
};

export type SearchBootstrapClient = {
  health(): Promise<Health>;
  getIndex(uid: string): Promise<unknown>;
  createIndex(uid: string, options: { primaryKey: string }): Promise<EnqueuedTask>;
  index(uid: string): SearchSettingsIndex;
  tasks: {
    waitForTask(task: EnqueuedTask): Promise<Task>;
  };
};

export type SearchBootstrapResult = {
  createdIndexes: string[];
  updatedIndexes: string[];
};

function errorCode(error: unknown): string | undefined {
  if (error instanceof MeilisearchApiError) return error.cause?.code;
  if (typeof error !== 'object' || error === null || !('cause' in error)) return undefined;
  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

function selectedSettings(actual: Settings, expected: Settings): Settings {
  return Object.fromEntries(
    Object.keys(expected).map((key) => [key, actual[key as keyof Settings]]),
  ) as Settings;
}

function sortedStringArray(value: unknown): unknown {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...value].sort()
    : value;
}

function normalizedManagedSettings(actual: Settings, expected: Settings): Settings {
  const selected = selectedSettings(actual, expected);
  const synonyms = selected.synonyms
    ? Object.fromEntries(
        Object.entries(selected.synonyms)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([term, alternatives]) => [term, [...alternatives].sort()]),
      )
    : selected.synonyms;

  return {
    ...selected,
    // Meilisearch v1.13 returns these set-like attributes alphabetically.
    // Searchable attributes and ranking rules intentionally retain order.
    filterableAttributes: sortedStringArray(
      selected.filterableAttributes,
    ) as Settings['filterableAttributes'],
    sortableAttributes: sortedStringArray(
      selected.sortableAttributes,
    ) as Settings['sortableAttributes'],
    synonyms,
  };
}

async function waitForSuccess(instance: SearchBootstrapClient, task: EnqueuedTask): Promise<Task> {
  const completed = await instance.tasks.waitForTask(task);
  if (completed.status !== 'succeeded') {
    throw new Error(
      `Meilisearch task ${completed.uid} ${completed.status}: ${completed.error?.message ?? 'unknown error'}`,
      { cause: completed.error },
    );
  }
  return completed;
}

async function ensureIndex(
  instance: SearchBootstrapClient,
  uid: string,
  check: boolean,
): Promise<boolean> {
  try {
    await instance.getIndex(uid);
    return false;
  } catch (error) {
    if (errorCode(error) !== 'index_not_found') throw error;
  }

  if (check) throw new Error(`Search settings drift: index ${uid} does not exist`);

  const task = await instance.createIndex(uid, { primaryKey: 'id' });
  try {
    await waitForSuccess(instance, task);
  } catch (error) {
    // Multiple API replicas may bootstrap concurrently. A completed competing
    // create is equivalent to success; every other task failure remains fatal.
    if (errorCode(error) !== 'index_already_exists') throw error;
  }
  return true;
}

export async function bootstrapSearch(
  options: {
    check?: boolean;
    client?: SearchBootstrapClient;
  } = {},
): Promise<SearchBootstrapResult> {
  assertSearchConfig();
  const instance = options.client ?? searchClient();
  await instance.health();

  const result: SearchBootstrapResult = { createdIndexes: [], updatedIndexes: [] };

  for (const kind of ['projects', 'designers'] as const) {
    const uid = searchIndexName(kind);
    if (await ensureIndex(instance, uid, options.check ?? false)) {
      result.createdIndexes.push(uid);
    }

    const index = instance.index(uid);
    const expected = MANAGED_SETTINGS[kind];
    const current = normalizedManagedSettings(await index.getSettings(), expected);
    const normalizedExpected = normalizedManagedSettings(expected, expected);
    if (isDeepStrictEqual(current, normalizedExpected)) continue;

    if (options.check) {
      throw new Error(`Search settings drift: index ${uid} does not match checked-in settings`);
    }

    await waitForSuccess(instance, await index.updateSettings(expected));
    result.updatedIndexes.push(uid);
  }

  return result;
}
