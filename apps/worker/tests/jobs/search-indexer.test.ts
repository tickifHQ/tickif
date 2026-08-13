import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOBS, type SearchIndexJob, type SearchIndexProjectJob } from '@repo/queue';
import type * as QueueModule from '@repo/queue';
import type { DesignerSearchSource, ProjectSearchSource } from '../../src/search/mapper.js';

vi.mock('@repo/search', () => ({
  deleteSearchDocument: vi.fn(async () => false),
  deleteSearchProjectsByDesigner: vi.fn(async () => 0),
  upsertSearchDocument: vi.fn(async (_kind, document) => document),
}));

vi.mock('@repo/queue', async (importOriginal) => {
  const original = await importOriginal<typeof QueueModule>();
  return {
    ...original,
    enqueueSearchProjectIndex: vi.fn(async () => undefined),
  };
});

vi.mock('../../src/search/repository.js', () => ({
  findProjectSearchSource: vi.fn(),
  findDesignerSearchSource: vi.fn(),
  listPublishedProjectIdsForDesigner: vi.fn(async () => []),
}));

vi.mock('../../src/search/rebuild.js', () => ({
  rebuildSearchCollections: vi.fn(),
}));

vi.mock('../../src/search/outbox-repository.js', () => ({
  markSearchProjectionEventDispatched: vi.fn(async () => undefined),
  withSearchProjectionEntityLock: vi.fn(
    async (_kind: string, _id: string, work: () => Promise<unknown>) => work(),
  ),
}));

const search = await import('@repo/search');
const queue = await import('@repo/queue');
const repository = await import('../../src/search/repository.js');
const outbox = await import('../../src/search/outbox-repository.js');
const { processSearchIndex } = await import('../../src/jobs/search-indexer.js');

const projectSource: ProjectSearchSource = {
  project: {
    id: 'project-1',
    slug: 'project-one',
    title: 'Project One',
    description: null,
    designerId: 'designer-1',
    citySlug: 'mumbai',
    localitySlug: null,
    propertyTypeSlug: null,
    propertySubtypeSlug: null,
    scopeSlug: null,
    bhkSlug: null,
    budgetBandSlug: null,
    sizeSqft: null,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    featuredAt: null,
  },
  designer: { slug: 'studio-one', displayName: 'Studio One', avgRating: '4.50', reviewCount: 2 },
  cover: null,
  rooms: [],
  images: [],
};

const designerSource: DesignerSearchSource = {
  profile: {
    id: 'designer-1',
    slug: 'studio-one',
    displayName: 'Studio One',
    bio: null,
    entityType: 'company',
    yearsExperience: 3,
    projectCount: 1,
    avgRating: '4.50',
    reviewCount: 2,
    logoImageId: null,
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    isKycVerified: false,
    kycExpiresAt: null,
  },
  footprint: [],
};

function job(name: string, data: SearchIndexJob): Job<SearchIndexJob> {
  return { name, data, attemptsMade: 0 } as Job<SearchIndexJob>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('search index processor', () => {
  it('deletes a stale project document even when the queued operation was index', async () => {
    vi.mocked(repository.findProjectSearchSource).mockResolvedValue(null);
    const data: SearchIndexProjectJob = {
      projectId: 'project-1',
      updatedAtEpoch: 1,
      eventId: '1',
      outboxSequence: '1',
    };

    await expect(processSearchIndex(job(JOBS.indexProject, data))).resolves.toBe('deleted');

    expect(search.deleteSearchDocument).toHaveBeenCalledWith('projects', 'project-1', {
      collectionName: undefined,
    });
    expect(search.upsertSearchDocument).not.toHaveBeenCalled();
    expect(outbox.markSearchProjectionEventDispatched).toHaveBeenCalledWith(1n);
  });

  it('re-indexes a currently published project even when the queued operation was delete', async () => {
    vi.mocked(repository.findProjectSearchSource).mockResolvedValue(projectSource);

    await expect(
      processSearchIndex(
        job(JOBS.deleteProject, {
          projectId: 'project-1',
          updatedAtEpoch: 2,
          eventId: '2',
        }),
      ),
    ).resolves.toBe('indexed');

    expect(search.upsertSearchDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({ id: 'project-1' }),
      { collectionName: undefined },
    );
  });

  it('keeps the outbox row pending when the Typesense write fails', async () => {
    vi.mocked(repository.findProjectSearchSource).mockResolvedValue(projectSource);
    vi.mocked(search.upsertSearchDocument).mockRejectedValueOnce(new Error('Typesense unavailable'));

    await expect(
      processSearchIndex(
        job(JOBS.indexProject, {
          projectId: 'project-1',
          updatedAtEpoch: 2,
          eventId: '20',
          outboxSequence: '20',
        }),
      ),
    ).rejects.toThrow('Typesense unavailable');

    expect(outbox.markSearchProjectionEventDispatched).not.toHaveBeenCalled();
  });

  it('removes an inactive designer and all denormalized project documents', async () => {
    vi.mocked(repository.findDesignerSearchSource).mockResolvedValue(null);

    await processSearchIndex(
      job(JOBS.indexDesigner, {
        profileId: 'designer-1',
        updatedAtEpoch: 3,
        eventId: '3',
      }),
    );

    expect(search.deleteSearchDocument).toHaveBeenCalledWith('designers', 'designer-1');
    expect(search.deleteSearchProjectsByDesigner).toHaveBeenCalledWith('designer-1');
  });

  it('indexes an active designer and fans out published projects in bounded pages', async () => {
    vi.mocked(repository.findDesignerSearchSource).mockResolvedValue(designerSource);
    vi.mocked(repository.listPublishedProjectIdsForDesigner)
      .mockResolvedValueOnce(['project-1', 'project-2'])
      .mockResolvedValueOnce([]);

    await expect(
      processSearchIndex(
        job(JOBS.indexDesigner, {
          profileId: 'designer-1',
          updatedAtEpoch: 4,
          eventId: '4',
        }),
      ),
    ).resolves.toEqual({ state: 'indexed', projectsEnqueued: 2 });

    expect(queue.enqueueSearchProjectIndex).toHaveBeenCalledTimes(2);
    expect(queue.enqueueSearchProjectIndex).toHaveBeenCalledWith({
      projectId: 'project-1',
      updatedAtEpoch: 4,
      eventId: '4-project-1',
    });
  });
});
