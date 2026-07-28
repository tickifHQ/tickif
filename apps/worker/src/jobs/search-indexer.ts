import type { Job } from 'bullmq';
import {
  JOBS,
  enqueueSearchProjectIndex,
  type SearchDeleteDesignerJob,
  type SearchDeleteProjectJob,
  type SearchIndexDesignerJob,
  type SearchIndexJob,
  type SearchIndexProjectJob,
  type SearchReindexAllJob,
} from '@repo/queue';
import {
  deleteSearchDocument,
  deleteSearchProjectsByDesigner,
  upsertSearchDocument,
} from '@repo/search';
import {
  findDesignerSearchSource,
  findProjectSearchSource,
  listPublishedProjectIdsForDesigner,
} from '../search/repository.js';
import { mapDesignerSearchDocument, mapProjectSearchDocument } from '../search/mapper.js';
import { rebuildSearchCollections } from '../search/rebuild.js';
import {
  markSearchProjectionEventDispatched,
  withSearchProjectionEntityLock,
} from '../search/outbox-repository.js';

const DESIGNER_PROJECT_BATCH_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function outboxSequence(data: Record<string, unknown>): string | undefined {
  if (data.outboxSequence === undefined) return undefined;
  if (typeof data.outboxSequence !== 'string' || !/^\d+$/.test(data.outboxSequence)) {
    throw new Error('Invalid search job outbox sequence');
  }
  return data.outboxSequence;
}

function projectJob(data: unknown): SearchIndexProjectJob | SearchDeleteProjectJob {
  if (
    !isRecord(data) ||
    typeof data.projectId !== 'string' ||
    typeof data.updatedAtEpoch !== 'number' ||
    typeof data.eventId !== 'string'
  ) {
    throw new Error('Invalid project search job payload');
  }
  return {
    projectId: data.projectId,
    updatedAtEpoch: data.updatedAtEpoch,
    eventId: data.eventId,
    outboxSequence: outboxSequence(data),
  };
}

function designerJob(data: unknown): SearchIndexDesignerJob | SearchDeleteDesignerJob {
  if (
    !isRecord(data) ||
    typeof data.profileId !== 'string' ||
    typeof data.updatedAtEpoch !== 'number' ||
    typeof data.eventId !== 'string'
  ) {
    throw new Error('Invalid designer search job payload');
  }
  return {
    profileId: data.profileId,
    updatedAtEpoch: data.updatedAtEpoch,
    eventId: data.eventId,
    outboxSequence: outboxSequence(data),
  };
}

function reindexJob(data: unknown): SearchReindexAllJob {
  if (!isRecord(data) || typeof data.requestedAtEpoch !== 'number') {
    throw new Error('Invalid full search reindex payload');
  }
  return { requestedAtEpoch: data.requestedAtEpoch };
}

export async function reconcileProject(
  projectId: string,
  collectionName?: string,
): Promise<'indexed' | 'deleted'> {
  return withSearchProjectionEntityLock('project', projectId, async () => {
    const source = await findProjectSearchSource(projectId);
    if (!source) {
      await deleteSearchDocument('projects', projectId, { collectionName });
      return 'deleted';
    }
    await upsertSearchDocument('projects', mapProjectSearchDocument(source), {
      collectionName,
    });
    return 'indexed';
  });
}

async function fanOutDesignerProjects(
  profileId: string,
  updatedAtEpoch: number,
  eventId: string,
): Promise<number> {
  let afterId: string | null = null;
  let enqueued = 0;

  while (true) {
    const projectIds = await listPublishedProjectIdsForDesigner(
      profileId,
      afterId,
      DESIGNER_PROJECT_BATCH_SIZE,
    );
    if (projectIds.length === 0) return enqueued;
    await Promise.all(
      projectIds.map((projectId) =>
        enqueueSearchProjectIndex({
          projectId,
          updatedAtEpoch,
          eventId: `${eventId}-${projectId}`,
        }),
      ),
    );
    enqueued += projectIds.length;
    afterId = projectIds.at(-1)!;
    if (projectIds.length < DESIGNER_PROJECT_BATCH_SIZE) return enqueued;
  }
}

export async function reconcileDesigner(
  profileId: string,
  updatedAtEpoch: number,
  eventId: string,
): Promise<{ state: 'indexed' | 'deleted'; projectsEnqueued: number }> {
  return withSearchProjectionEntityLock('designer', profileId, async () => {
    const source = await findDesignerSearchSource(profileId);
    if (!source) {
      await Promise.all([
        deleteSearchDocument('designers', profileId),
        deleteSearchProjectsByDesigner(profileId),
      ]);
      return { state: 'deleted', projectsEnqueued: 0 };
    }

    await upsertSearchDocument('designers', mapDesignerSearchDocument(source));
    return {
      state: 'indexed',
      projectsEnqueued: await fanOutDesignerProjects(profileId, updatedAtEpoch, eventId),
    };
  });
}

export async function processSearchIndex(job: Job<SearchIndexJob>): Promise<unknown> {
  switch (job.name) {
    case JOBS.indexProject:
    case JOBS.deleteProject: {
      const data = projectJob(job.data);
      const result = await reconcileProject(data.projectId);
      if (data.outboxSequence) {
        await markSearchProjectionEventDispatched(BigInt(data.outboxSequence));
      }
      return result;
    }
    case JOBS.indexDesigner:
    case JOBS.deleteDesigner: {
      const data = designerJob(job.data);
      const result = await reconcileDesigner(data.profileId, data.updatedAtEpoch, data.eventId);
      if (data.outboxSequence) {
        await markSearchProjectionEventDispatched(BigInt(data.outboxSequence));
      }
      return result;
    }
    case JOBS.reindexAll: {
      const data = reindexJob(job.data);
      return rebuildSearchCollections(data.requestedAtEpoch, job.attemptsMade);
    }
    default:
      throw new Error(`Unknown search-index job: ${job.name}`);
  }
}
