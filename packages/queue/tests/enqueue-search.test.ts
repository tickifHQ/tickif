import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addMock, closeMock, queueMock } = vi.hoisted(() => {
  const add = vi.fn();
  const close = vi.fn();
  return {
    addMock: add,
    closeMock: close,
    queueMock: vi.fn(function Queue() {
      return {
        add,
        close,
      };
    }),
  };
});

vi.mock('bullmq', () => ({
  Queue: queueMock,
}));

describe('search indexing queue', () => {
  beforeEach(() => {
    vi.resetModules();
    addMock.mockReset();
    closeMock.mockReset();
    queueMock.mockClear();
  });

  afterEach(async () => {
    const { closeQueues } = await import('../src/index.js');
    await closeQueues();
  });

  it('adds project index and delete jobs with deterministic BullMQ-safe IDs', async () => {
    const {
      enqueueSearchProjectDelete,
      enqueueSearchProjectIndex,
      JOBS,
      QUEUES,
      defaultJobOptions,
    } = await import('../src/index.js');
    const { Queue } = await import('bullmq');
    const job = { projectId: 'project-1', updatedAtEpoch: 1_753_680_000_000 };

    await enqueueSearchProjectIndex(job);
    await enqueueSearchProjectDelete(job);

    expect(Queue).toHaveBeenCalledTimes(1);
    expect(Queue).toHaveBeenCalledWith(
      QUEUES.searchIndex,
      expect.objectContaining({ defaultJobOptions }),
    );
    expect(addMock).toHaveBeenNthCalledWith(1, JOBS.indexProject, job, {
      jobId: 'index-project-project-1-1753680000000',
    });
    expect(addMock).toHaveBeenNthCalledWith(2, JOBS.deleteProject, job, {
      jobId: 'delete-project-project-1-1753680000000',
    });
  });

  it('adds designer index and delete jobs with deterministic BullMQ-safe IDs', async () => {
    const { enqueueSearchDesignerDelete, enqueueSearchDesignerIndex, JOBS } =
      await import('../src/index.js');
    const job = { profileId: 'profile-1', updatedAtEpoch: 1_753_680_000_000 };

    await enqueueSearchDesignerIndex(job);
    await enqueueSearchDesignerDelete(job);

    expect(addMock).toHaveBeenNthCalledWith(1, JOBS.indexDesigner, job, {
      jobId: 'index-designer-profile-1-1753680000000',
    });
    expect(addMock).toHaveBeenNthCalledWith(2, JOBS.deleteDesigner, job, {
      jobId: 'delete-designer-profile-1-1753680000000',
    });
  });

  it('deduplicates the same full-reindex request without blocking later requests', async () => {
    const { enqueueSearchReindexAll, JOBS } = await import('../src/index.js');

    await enqueueSearchReindexAll({ requestedAtEpoch: 1_753_680_000_000 });
    await enqueueSearchReindexAll({ requestedAtEpoch: 1_753_680_000_001 });

    expect(addMock).toHaveBeenNthCalledWith(
      1,
      JOBS.reindexAll,
      { requestedAtEpoch: 1_753_680_000_000 },
      { jobId: 'reindex-all-1753680000000' },
    );
    expect(addMock).toHaveBeenNthCalledWith(
      2,
      JOBS.reindexAll,
      { requestedAtEpoch: 1_753_680_000_001 },
      { jobId: 'reindex-all-1753680000001' },
    );
  });

  it('closes and recreates the lazy search queue', async () => {
    const { closeQueues, enqueueSearchProjectIndex } = await import('../src/index.js');
    const { Queue } = await import('bullmq');
    const job = { projectId: 'project-1', updatedAtEpoch: 1_753_680_000_000 };

    await enqueueSearchProjectIndex(job);
    await closeQueues();
    await enqueueSearchProjectIndex(job);

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(Queue).toHaveBeenCalledTimes(2);
  });
});
