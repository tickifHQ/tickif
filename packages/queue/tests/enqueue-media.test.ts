import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { addMock, closeMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return {
      add: addMock,
      close: closeMock,
    };
  }),
}));

describe('enqueueMedia', () => {
  beforeEach(() => {
    vi.resetModules();
    addMock.mockReset();
    closeMock.mockReset();
  });

  afterEach(async () => {
    const { closeQueues } = await import('../src/index.js');
    await closeQueues();
  });

  it('configures retry + bounded cleanup on the media queue', async () => {
    const { defaultJobOptions } = await import('../src/index.js');
    expect(defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
    });
  });

  it('adds a media job with queue defaults and an imageId-keyed jobId', async () => {
    const { enqueueMedia, JOBS, QUEUES, defaultJobOptions } = await import('../src/index.js');
    const { Queue } = await import('bullmq');

    await enqueueMedia({ imageId: 'img-1' });

    expect(Queue).toHaveBeenCalledWith(
      QUEUES.media,
      expect.objectContaining({ defaultJobOptions }),
    );
    expect(addMock).toHaveBeenCalledWith(
      JOBS.processMedia,
      { imageId: 'img-1' },
      { jobId: 'media-img-1' },
    );
  });

  it('produces a stable jobId per imageId so duplicate delivery collapses', async () => {
    const { enqueueMedia } = await import('../src/index.js');

    await enqueueMedia({ imageId: 'img-9' });
    await enqueueMedia({ imageId: 'img-9' });

    expect(addMock.mock.calls[0]?.[2]?.jobId).toBe('media-img-9');
    expect(addMock.mock.calls[1]?.[2]?.jobId).toBe('media-img-9');
  });

  it('uses a separate stable jobId for explicit derivative reprocessing', async () => {
    const { enqueueMedia, JOBS } = await import('../src/index.js');

    await enqueueMedia({ imageId: 'img-9', mode: 'reprocess' });

    expect(addMock).toHaveBeenCalledWith(
      JOBS.processMedia,
      { imageId: 'img-9', mode: 'reprocess' },
      { jobId: 'media-reprocess-img-9' },
    );
  });
});
