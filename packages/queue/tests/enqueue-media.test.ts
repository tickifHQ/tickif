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
      removeOnFail: 100,
    });
  });

  it('adds a media job with queue defaults and an imageId-keyed jobId', async () => {
    const { enqueueMedia, JOBS, QUEUES, defaultJobOptions } = await import('../src/index.js');
    const { Queue } = await import('bullmq');

    await enqueueMedia({ imageId: 'img-1', storageKey: 'originals/p/abc' });

    expect(Queue).toHaveBeenCalledWith(
      QUEUES.media,
      expect.objectContaining({ defaultJobOptions }),
    );
    expect(addMock).toHaveBeenCalledWith(
      JOBS.processMedia,
      { imageId: 'img-1', storageKey: 'originals/p/abc' },
      { jobId: 'media-img-1' },
    );
  });

  it('produces a stable jobId per imageId so duplicate delivery collapses', async () => {
    const { enqueueMedia } = await import('../src/index.js');

    await enqueueMedia({ imageId: 'img-9', storageKey: 'originals/p/a' });
    await enqueueMedia({ imageId: 'img-9', storageKey: 'originals/p/b' });

    expect(addMock.mock.calls[0]?.[2]?.jobId).toBe('media-img-9');
    expect(addMock.mock.calls[1]?.[2]?.jobId).toBe('media-img-9');
  });
});
