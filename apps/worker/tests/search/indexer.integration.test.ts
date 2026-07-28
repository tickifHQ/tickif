import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Worker } from 'bullmq';
import { Errors } from 'typesense';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { closeQueues, QUEUES, type SearchIndexJob } from '@repo/queue';
import {
  bootstrapSearch,
  deleteSearchCollection,
  getSearchCollectionTarget,
  searchCollectionName,
  searchWriteClient,
  swapSearchCollectionAlias,
  type ProjectSearchDocument,
} from '@repo/search';
import { processSearchIndex, reconcileProject } from '../../src/jobs/search-indexer.js';
import { connection } from '../../src/connection.js';
import { dispatchSearchProjectionOutbox } from '../../src/search/outbox-dispatcher.js';
import { rebuildSearchCollections } from '../../src/search/rebuild.js';

const indexedIds = new Set<string>();
let searchWorker: Worker<SearchIndexJob>;

async function eventually<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!matches(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = await read();
  }
  expect(matches(value)).toBe(true);
  return value;
}

beforeAll(async () => {
  await bootstrapSearch();
  searchWorker = new Worker<SearchIndexJob>(QUEUES.searchIndex, processSearchIndex, {
    connection,
    concurrency: 1,
  });
  await searchWorker.waitUntilReady();
});

afterAll(async () => {
  await searchWorker.close();
  await closeQueues();
});

afterEach(async () => {
  await Promise.all(
    [...indexedIds].map((id) =>
      searchWriteClient()
        .collections(searchCollectionName('projects'))
        .documents(id)
        .delete()
        .catch((error) => {
          if (!(error instanceof Errors.ObjectNotFound)) throw error;
        }),
    ),
  );
  indexedIds.clear();
});

describe('search indexer against Typesense', () => {
  it('projects publish and unpublish outbox events through Redis within seconds', async () => {
    const designer = await makeDesigner({
      status: 'active',
      displayName: 'Queued Search Studio',
    });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date('2026-07-05T00:00:00.000Z'),
      title: 'Queued Search Home',
    });
    indexedIds.add(project.id);
    const [publishEvent] = await db
      .insert(schema.searchProjectionOutbox)
      .values({
        entityKind: 'project',
        entityId: project.id,
        operation: 'index',
        sourceUpdatedAt: project.updatedAt,
      })
      .returning();

    await expect(dispatchSearchProjectionOutbox()).resolves.toMatchObject({ enqueued: 1 });

    const indexed = await eventually(
      () =>
        searchWriteClient()
          .collections<ProjectSearchDocument>(searchCollectionName('projects'))
          .documents(project.id)
          .retrieve()
          .catch(() => null),
      (value) => value?.title === 'Queued Search Home',
    );
    expect(indexed).toMatchObject({ id: project.id, designerName: 'Queued Search Studio' });
    await eventually(
      async () => {
        const [row] = await db
          .select({ dispatchedAt: schema.searchProjectionOutbox.dispatchedAt })
          .from(schema.searchProjectionOutbox)
          .where(eq(schema.searchProjectionOutbox.sequence, publishEvent!.sequence));
        return row?.dispatchedAt ?? null;
      },
      (value) => value !== null,
    );

    const unpublishAt = new Date('2026-07-06T00:00:00.000Z');
    await db.transaction(async (tx) => {
      await tx
        .update(schema.project)
        .set({ status: 'in_review', publishedAt: null, updatedAt: unpublishAt })
        .where(eq(schema.project.id, project.id));
      await tx.insert(schema.searchProjectionOutbox).values({
        entityKind: 'project',
        entityId: project.id,
        operation: 'delete',
        sourceUpdatedAt: unpublishAt,
      });
    });

    await expect(dispatchSearchProjectionOutbox()).resolves.toMatchObject({ enqueued: 1 });
    await eventually(
      () =>
        searchWriteClient()
          .collections(searchCollectionName('projects'))
          .documents(project.id)
          .retrieve()
          .then(() => false)
          .catch((error) => error instanceof Errors.ObjectNotFound),
      (deleted) => deleted,
    );
  });

  it('makes a published project visible and removes it after unpublish', async () => {
    const designer = await makeDesigner({
      status: 'active',
      displayName: 'Searchable Studio',
    });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date('2026-07-01T00:00:00.000Z'),
      title: 'Typesense Integration Home',
    });
    indexedIds.add(project.id);

    await expect(reconcileProject(project.id)).resolves.toBe('indexed');
    await expect(
      searchWriteClient()
        .collections<ProjectSearchDocument>(searchCollectionName('projects'))
        .documents(project.id)
        .retrieve(),
    ).resolves.toMatchObject({
      id: project.id,
      title: 'Typesense Integration Home',
      designerName: 'Searchable Studio',
    });

    await db
      .update(schema.project)
      .set({ status: 'in_review', publishedAt: null })
      .where(eq(schema.project.id, project.id));

    await expect(reconcileProject(project.id)).resolves.toBe('deleted');
    await expect(
      searchWriteClient()
        .collections(searchCollectionName('projects'))
        .documents(project.id)
        .retrieve(),
    ).rejects.toBeInstanceOf(Errors.ObjectNotFound);
  });

  it('rebuilds physical collections before atomically replacing stable aliases', async () => {
    const designer = await makeDesigner({
      status: 'active',
      displayName: 'Rebuild Studio',
    });
    const project = await makeProject({
      designerId: designer.id,
      status: 'published',
      publishedAt: new Date('2026-07-03T00:00:00.000Z'),
      title: 'Rebuilt Project',
    });
    const previous = {
      projects: await getSearchCollectionTarget('projects'),
      designers: await getSearchCollectionTarget('designers'),
    };
    const requestedAtEpoch = Date.now();
    let rebuilt: Awaited<ReturnType<typeof rebuildSearchCollections>> | undefined;

    try {
      rebuilt = await rebuildSearchCollections(requestedAtEpoch, 0);
      expect(await getSearchCollectionTarget('projects')).toBe(rebuilt.collections.projects);
      expect(await getSearchCollectionTarget('designers')).toBe(rebuilt.collections.designers);
      await expect(
        searchWriteClient()
          .collections<ProjectSearchDocument>(rebuilt.collections.projects)
          .documents(project.id)
          .retrieve(),
      ).resolves.toMatchObject({ id: project.id, title: 'Rebuilt Project' });
    } finally {
      if (rebuilt) {
        await swapSearchCollectionAlias('projects', previous.projects);
        await swapSearchCollectionAlias('designers', previous.designers);
        await deleteSearchCollection('projects', rebuilt.collections.projects);
        await deleteSearchCollection('designers', rebuilt.collections.designers);
      }
    }
  });
});
