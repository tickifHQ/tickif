import { Errors } from 'typesense';
import {
  createSearchCollection,
  deleteSearchCollection,
  deleteSearchDocument,
  deleteSearchProjectsByDesigner,
  getSearchCollectionTarget,
  importSearchDocuments,
  swapSearchCollectionAlias,
  upsertSearchDocument,
  versionedSearchCollectionName,
  type SearchCollectionKind,
} from '@repo/search';
import {
  findDesignerSearchSource,
  findProjectSearchSource,
  listActiveDesignerIds,
  listPublishedProjectIdsForDesigner,
  listSearchableProjectIds,
} from './repository.js';
import { mapDesignerSearchDocument, mapProjectSearchDocument } from './mapper.js';
import {
  latestSearchProjectionSequence,
  listSearchProjectionEventsBetween,
  withSearchProjectionRebuildBarrier,
  type SearchProjectionOutboxRecord,
} from './outbox-repository.js';

const REBUILD_BATCH_SIZE = 100;

type RebuildTargets = {
  projects: string;
  designers: string;
};

async function importAllProjects(collectionName: string): Promise<number> {
  let afterId: string | null = null;
  let imported = 0;
  while (true) {
    const ids = await listSearchableProjectIds(afterId, REBUILD_BATCH_SIZE);
    if (ids.length === 0) return imported;
    const sources = await Promise.all(ids.map((id) => findProjectSearchSource(id)));
    const documents = sources.filter((source) => source !== null).map(mapProjectSearchDocument);
    await importSearchDocuments('projects', collectionName, documents);
    imported += documents.length;
    afterId = ids.at(-1)!;
    if (ids.length < REBUILD_BATCH_SIZE) return imported;
  }
}

async function importAllDesigners(collectionName: string): Promise<number> {
  let afterId: string | null = null;
  let imported = 0;
  while (true) {
    const ids = await listActiveDesignerIds(afterId, REBUILD_BATCH_SIZE);
    if (ids.length === 0) return imported;
    const sources = await Promise.all(ids.map((id) => findDesignerSearchSource(id)));
    const documents = sources.filter((source) => source !== null).map(mapDesignerSearchDocument);
    await importSearchDocuments('designers', collectionName, documents);
    imported += documents.length;
    afterId = ids.at(-1)!;
    if (ids.length < REBUILD_BATCH_SIZE) return imported;
  }
}

async function reconcileProjectCandidate(projectId: string, collectionName: string): Promise<void> {
  const source = await findProjectSearchSource(projectId);
  if (source) {
    await upsertSearchDocument('projects', mapProjectSearchDocument(source), {
      collectionName,
    });
  } else {
    await deleteSearchDocument('projects', projectId, { collectionName });
  }
}

async function reconcileDesignerCandidate(
  profileId: string,
  targets: RebuildTargets,
): Promise<void> {
  const source = await findDesignerSearchSource(profileId);
  if (source) {
    await upsertSearchDocument('designers', mapDesignerSearchDocument(source), {
      collectionName: targets.designers,
    });
    let afterId: string | null = null;
    while (true) {
      const ids = await listPublishedProjectIdsForDesigner(profileId, afterId, REBUILD_BATCH_SIZE);
      const projects = await Promise.all(ids.map((id) => findProjectSearchSource(id)));
      const documents = projects
        .filter((project) => project !== null)
        .map(mapProjectSearchDocument);
      if (documents.length > 0) {
        await importSearchDocuments('projects', targets.projects, documents);
      }
      if (ids.length === 0 || ids.length < REBUILD_BATCH_SIZE) break;
      afterId = ids.at(-1)!;
    }
    return;
  }

  await Promise.all([
    deleteSearchDocument('designers', profileId, {
      collectionName: targets.designers,
    }),
    deleteSearchProjectsByDesigner(profileId, {
      collectionName: targets.projects,
    }),
  ]);
}

async function replayEvent(
  event: SearchProjectionOutboxRecord,
  targets: RebuildTargets,
): Promise<void> {
  if (event.entityKind === 'project') {
    await reconcileProjectCandidate(event.entityId, targets.projects);
  } else {
    await reconcileDesignerCandidate(event.entityId, targets);
  }
}

async function replayThrough(
  after: bigint,
  through: bigint,
  targets: RebuildTargets,
): Promise<number> {
  let afterSequence = after;
  let replayed = 0;
  while (afterSequence < through) {
    const events = await listSearchProjectionEventsBetween(
      afterSequence,
      through,
      REBUILD_BATCH_SIZE,
    );
    if (events.length === 0) return replayed;
    for (const event of events) await replayEvent(event, targets);
    replayed += events.length;
    afterSequence = events.at(-1)!.sequence;
  }
  return replayed;
}

async function cleanupCandidate(kind: SearchCollectionKind, collectionName: string): Promise<void> {
  try {
    if ((await getSearchCollectionTarget(kind)) === collectionName) return;
    await deleteSearchCollection(kind, collectionName);
  } catch (error) {
    if (error instanceof Errors.ObjectNotFound) return;
    console.error(`[worker] failed to clean up search collection ${collectionName}:`, error);
  }
}

export async function rebuildSearchCollections(
  requestedAtEpoch: number,
  attempt: number,
): Promise<{
  projects: number;
  designers: number;
  replayed: number;
  collections: RebuildTargets;
}> {
  const version = `${requestedAtEpoch}-${attempt}`;
  const targets: RebuildTargets = {
    projects: versionedSearchCollectionName('projects', version),
    designers: versionedSearchCollectionName('designers', version),
  };
  const previous: RebuildTargets = {
    projects: await getSearchCollectionTarget('projects'),
    designers: await getSearchCollectionTarget('designers'),
  };
  const startSequence = await withSearchProjectionRebuildBarrier(() =>
    latestSearchProjectionSequence(),
  );

  let projectAliasSwapped = false;
  try {
    await createSearchCollection('projects', targets.projects);
    await createSearchCollection('designers', targets.designers);
    const [projects, designers] = await Promise.all([
      importAllProjects(targets.projects),
      importAllDesigners(targets.designers),
    ]);

    const preReplaySequence = await withSearchProjectionRebuildBarrier(() =>
      latestSearchProjectionSequence(),
    );
    let replayed = await replayThrough(startSequence, preReplaySequence, targets);

    replayed += await withSearchProjectionRebuildBarrier(async () => {
      const finalSequence = await latestSearchProjectionSequence();
      const count = await replayThrough(preReplaySequence, finalSequence, targets);
      await swapSearchCollectionAlias('projects', targets.projects);
      projectAliasSwapped = true;
      try {
        await swapSearchCollectionAlias('designers', targets.designers);
      } catch (error) {
        await swapSearchCollectionAlias('projects', previous.projects);
        projectAliasSwapped = false;
        throw error;
      }
      return count;
    });

    return { projects, designers, replayed, collections: targets };
  } catch (error) {
    if (projectAliasSwapped) {
      await swapSearchCollectionAlias('projects', previous.projects).catch((rollbackError) =>
        console.error('[worker] failed to roll back projects search alias:', rollbackError),
      );
    }
    await Promise.all([
      cleanupCandidate('projects', targets.projects),
      cleanupCandidate('designers', targets.designers),
    ]);
    throw error;
  }
}
