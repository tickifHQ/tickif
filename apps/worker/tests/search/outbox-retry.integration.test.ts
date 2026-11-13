import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { asc, db, inArray, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { QUEUES, closeQueues, connection, type SearchIndexJob } from '@repo/queue';
import {
  bootstrapSearch,
  deleteSearchCollection,
  getSearchCollectionTarget,
  searchCollectionName,
  searchWriteClient,
  swapSearchCollectionAlias,
  type ProjectSearchDocument,
} from '@repo/search';
import type * as SearchModule from '@repo/search';
import { processSearchIndex } from '../../src/jobs/search-indexer.js';
import { failureState } from '../../src/observability/lifecycle.js';
import { dispatchSearchProjectionOutbox } from '../../src/search/outbox-dispatcher.js';
import { rebuildSearchCollections } from '../../src/search/rebuild.js';

const outage = vi.hoisted(() => ({ active: false }));

vi.mock('@repo/search', async (importOriginal) => {
  const actual = await importOriginal<typeof SearchModule>();
  const unavailable = () => {
    throw new Error('Typesense unavailable');
  };
  return {
    ...actual,
    upsertSearchDocument: (...args: Parameters<typeof actual.upsertSearchDocument>) =>
      outage.active ? unavailable() : actual.upsertSearchDocument(...args),
    deleteSearchDocument: (...args: Parameters<typeof actual.deleteSearchDocument>) =>
      outage.active ? unavailable() : actual.deleteSearchDocument(...args),
  };
});

const queue = new Queue<SearchIndexJob>(QUEUES.searchIndex, { connection });
let searchWorker: Worker<SearchIndexJob> | undefined;
let terminalFailures = 0;

async function eventually(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function outboxRows(sequences: bigint[]) {
  return db
    .select()
    .from(schema.searchProjectionOutbox)
    .where(inArray(schema.searchProjectionOutbox.sequence, sequences))
    .orderBy(asc(schema.searchProjectionOutbox.sequence));
}

async function insertMissingProjectDeletes(count: number): Promise<bigint[]> {
  const rows = await db
    .insert(schema.searchProjectionOutbox)
    .values(
      Array.from({ length: count }, () => ({
        entityKind: 'project' as const,
        entityId: crypto.randomUUID(),
        operation: 'delete' as const,
        sourceUpdatedAt: new Date(),
      })),
    )
    .returning({ sequence: schema.searchProjectionOutbox.sequence });
  return rows.map((row) => row.sequence);
}

beforeAll(async () => {
  await bootstrapSearch({ applyUpdates: true });
  await queue.obliterate({ force: true });
  searchWorker = new Worker<SearchIndexJob>(QUEUES.searchIndex, processSearchIndex, {
    connection,
    concurrency: 4,
  });
  searchWorker.on('failed', (job) => {
    if (failureState(job) === 'terminal') terminalFailures += 1;
  });
  await searchWorker.waitUntilReady();
});

beforeEach(() => {
  outage.active = false;
  terminalFailures = 0;
});

afterAll(async () => {
  await searchWorker?.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await closeQueues();
});

describe('search projection outbox retries', () => {
  it('keeps indexing newer rows while a failed batch backs off, then retries it', async () => {
    const failed = await insertMissingProjectDeletes(100);
    outage.active = true;
    await expect(dispatchSearchProjectionOutbox()).resolves.toEqual({ enqueued: 100, failed: 0 });
    await eventually(async () => terminalFailures === 100);
    outage.active = false;

    const designer = await makeDesigner({ status: 'active', displayName: 'Recovery Studio' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date(),
      title: 'Published After Outage',
    });
    const [published] = await db
      .insert(schema.searchProjectionOutbox)
      .values({
        entityKind: 'project',
        entityId: project.id,
        operation: 'index',
        sourceUpdatedAt: project.updatedAt,
      })
      .returning();

    await expect(dispatchSearchProjectionOutbox()).resolves.toEqual({ enqueued: 1, failed: 0 });
    await eventually(
      async () => (await outboxRows([published!.sequence]))[0]?.dispatchedAt !== null,
    );
    await expect(
      searchWriteClient()
        .collections<ProjectSearchDocument>(searchCollectionName('projects'))
        .documents(project.id)
        .retrieve(),
    ).resolves.toMatchObject({ title: 'Published After Outage' });
    await searchWriteClient()
      .collections(searchCollectionName('projects'))
      .documents(project.id)
      .delete();

    const backingOff = await outboxRows(failed);
    expect(backingOff.every((row) => row.dispatchedAt === null)).toBe(true);
    expect(backingOff[0]).toMatchObject({ attempts: 1, lastError: 'Typesense unavailable' });
    expect(backingOff[0]!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    const later = new Date(Date.now() + 60 * 60 * 1000);
    await expect(dispatchSearchProjectionOutbox(later)).resolves.toEqual({
      enqueued: 100,
      failed: 0,
    });
    await eventually(async () =>
      (await outboxRows(failed)).every((row) => row.dispatchedAt !== null),
    );
  });

  it('marks the backlog dispatched after a full rebuild', async () => {
    const stuck = await insertMissingProjectDeletes(3);
    const previous = {
      projects: await getSearchCollectionTarget('projects'),
      designers: await getSearchCollectionTarget('designers'),
    };

    const rebuilt = await rebuildSearchCollections(Date.now(), 0);
    try {
      expect((await outboxRows(stuck)).map((row) => row.dispatchedAt)).not.toContain(null);
    } finally {
      await swapSearchCollectionAlias('projects', previous.projects);
      await swapSearchCollectionAlias('designers', previous.designers);
      await deleteSearchCollection('projects', rebuilt.collections.projects);
      await deleteSearchCollection('designers', rebuilt.collections.designers);
    }
  });
});
