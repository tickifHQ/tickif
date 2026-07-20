import type { EnqueuedTask, MeilisearchErrorResponse, Settings, Task } from 'meilisearch';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapSearch, type SearchBootstrapClient } from '../src/bootstrap.js';
import { searchIndexName } from '../src/client.js';

const now = '2026-07-20T00:00:00.000Z';
const projectIndexName = searchIndexName('projects');
const designerIndexName = searchIndexName('designers');

function enqueued(taskUid: number, indexUid: string): EnqueuedTask {
  return {
    taskUid,
    indexUid,
    status: 'enqueued',
    type: 'settingsUpdate',
    enqueuedAt: now,
  };
}

function completed(task: EnqueuedTask): Task {
  return {
    uid: task.taskUid,
    batchUid: null,
    indexUid: task.indexUid,
    status: 'succeeded',
    type: task.type,
    canceledBy: null,
    error: null,
    duration: 'PT0.001S',
    enqueuedAt: task.enqueuedAt,
    startedAt: now,
    finishedAt: now,
  };
}

function notFound(): Error {
  const cause: MeilisearchErrorResponse = {
    message: 'Index not found',
    code: 'index_not_found',
    type: 'invalid_request',
    link: 'https://docs.meilisearch.com/errors#index_not_found',
  };
  return new Error('Index not found', { cause });
}

function fakeClient() {
  const settings = new Map<string, Settings>();
  let taskUid = 0;

  const createIndex = vi.fn(async (uid: string) => {
    settings.set(uid, {});
    return enqueued(++taskUid, uid);
  });
  const updateSettings = vi.fn(async (uid: string, next: Settings) => {
    settings.set(uid, { ...settings.get(uid), ...next });
    return enqueued(++taskUid, uid);
  });
  const waitForTask = vi.fn(async (task: EnqueuedTask) => completed(task));

  const client: SearchBootstrapClient = {
    health: vi.fn(async () => ({ status: 'available' as const })),
    getIndex: vi.fn(async (uid: string) => {
      if (!settings.has(uid)) throw notFound();
      return { uid };
    }),
    createIndex,
    index: (uid: string) => ({
      getSettings: vi.fn(async () => {
        const current = settings.get(uid) ?? {};
        return {
          ...current,
          // v1.13 normalizes these set-like fields before returning them.
          filterableAttributes: [...(current.filterableAttributes ?? [])].sort(),
          sortableAttributes: [...(current.sortableAttributes ?? [])].sort(),
        };
      }),
      updateSettings: (next: Settings) => updateSettings(uid, next),
    }),
    tasks: {
      waitForTask,
    },
  };

  return { client, createIndex, updateSettings, waitForTask };
}

describe('bootstrapSearch', () => {
  it('creates and configures both indexes, then performs no writes on a second pass', async () => {
    const fake = fakeClient();

    await expect(bootstrapSearch({ client: fake.client })).resolves.toEqual({
      createdIndexes: [projectIndexName, designerIndexName],
      updatedIndexes: [projectIndexName, designerIndexName],
    });
    expect(fake.createIndex).toHaveBeenCalledTimes(2);
    expect(fake.updateSettings).toHaveBeenCalledTimes(2);

    await expect(bootstrapSearch({ client: fake.client })).resolves.toEqual({
      createdIndexes: [],
      updatedIndexes: [],
    });
    expect(fake.createIndex).toHaveBeenCalledTimes(2);
    expect(fake.updateSettings).toHaveBeenCalledTimes(2);
  });

  it('reports missing indexes in check mode without mutating Meilisearch', async () => {
    const fake = fakeClient();

    await expect(bootstrapSearch({ client: fake.client, check: true })).rejects.toThrow(
      `Search settings drift: index ${projectIndexName} does not exist`,
    );
    expect(fake.createIndex).not.toHaveBeenCalled();
    expect(fake.updateSettings).not.toHaveBeenCalled();
  });

  it('fails bootstrap when a Meilisearch task is canceled', async () => {
    const fake = fakeClient();
    const task = enqueued(1, projectIndexName);
    fake.waitForTask.mockResolvedValueOnce({ ...completed(task), status: 'canceled' });

    await expect(bootstrapSearch({ client: fake.client })).rejects.toThrow(
      'Meilisearch task 1 canceled',
    );
  });
});
