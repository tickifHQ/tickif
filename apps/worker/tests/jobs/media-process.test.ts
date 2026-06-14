import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Job } from 'bullmq';
import sharp from 'sharp';

vi.mock('@repo/config', () => ({
  config: {
    MEDIA_DEDUP_HAMMING_THRESHOLD: 10,
    MEDIA_DEDUP_ACTION: 'reject',
    MEDIA_MAX_IMAGE_PIXELS: 40_000_000,
    MEDIA_MAX_UPLOAD_BYTES: 15_000_000,
    MEDIA_MAX_IMAGE_DIMENSION: 12_000,
    WATERMARK_ENABLED: true,
    WATERMARK_TEXT: 'Tickif',
    WATERMARK_OPACITY: 0.6,
  },
  isProduction: false,
  isDevelopment: false,
  isTest: true,
}));
vi.mock('@repo/storage', () => ({
  getObject: vi.fn(),
  putObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  buildDerivativeKey: (p: string, i: string, v: string, f: string) =>
    `derivatives/${p}/${i}/${v}.${f}`,
  ObjectTooLargeError: class ObjectTooLargeError extends Error {
    constructor(
      public key: string,
      public size: number,
      public maxBytes: number,
    ) {
      super(`object ${key} too large`);
      this.name = 'ObjectTooLargeError';
    }
  },
}));
vi.mock('../../src/media/repository.js', () => ({
  getImageForProcessing: vi.fn(),
  markReady: vi.fn(async () => true),
  markFailed: vi.fn(async () => {}),
  findProjectPhashes: vi.fn(async () => []),
}));

import { processMedia } from '../../src/jobs/media-process.js';
import { getObject, putObject, deleteObject, ObjectTooLargeError } from '@repo/storage';
import { config } from '@repo/config';
import * as repo from '../../src/media/repository.js';
import { computePhash } from '../../src/media/phash.js';

const getObjectMock = vi.mocked(getObject);
const putObjectMock = vi.mocked(putObject);
const deleteObjectMock = vi.mocked(deleteObject);
const repoMock = vi.mocked(repo);

const job = (imageId: string): Job<{ imageId: string }> =>
  ({ id: 'j1', data: { imageId } }) as Job<{ imageId: string }>;

const processing = {
  id: 'img-1',
  projectId: 'proj-1',
  originalKey: 'originals/proj-1/abc',
  contentType: 'image/jpeg',
  status: 'processing' as const,
};

let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: 'blue' } })
    .jpeg()
    .toBuffer();
});

beforeEach(() => {
  vi.clearAllMocks();
  config.MEDIA_DEDUP_ACTION = 'reject';
  repoMock.markReady.mockResolvedValue(true);
});

describe('processMedia', () => {
  it('skips when the image row is gone', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(null);
    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'missing' });
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('is idempotent — skips an already-ready image', async () => {
    repoMock.getImageForProcessing.mockResolvedValue({ ...processing, status: 'ready' });
    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'already-ready' });
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('does not reprocess an already-failed image (no flapping on re-enqueue)', async () => {
    repoMock.getImageForProcessing.mockResolvedValue({ ...processing, status: 'failed' });
    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'already-failed' });
    expect(getObjectMock).not.toHaveBeenCalled();
    expect(repoMock.markReady).not.toHaveBeenCalled();
  });

  it('processes, stores derivatives, and flips status to ready', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.findProjectPhashes.mockResolvedValue([]);

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: true, derivatives: 8 });
    expect(putObjectMock).toHaveBeenCalledTimes(8);
    expect(repoMock.markReady).toHaveBeenCalledTimes(1);
    const [, data] = repoMock.markReady.mock.calls[0]!;
    expect(data.width).toBe(800);
    expect(data.height).toBe(600);
    expect(data.derivatives).toHaveLength(8);
    expect(data.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('reports lost-race when another run already finished the image', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.markReady.mockResolvedValue(false);

    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'lost-race' });
  });

  it('permanently fails + deletes the original when the bytes are not a valid image', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(Buffer.from('definitely not an image'));

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: false, reason: 'corrupt' });
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
    expect(deleteObjectMock).toHaveBeenCalledWith(processing.originalKey);
    expect(repoMock.markReady).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('treats an oversize object as a permanent failure (no retry)', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockRejectedValue(new ObjectTooLargeError(processing.originalKey, 99, 1));

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: false, reason: 'too_large' });
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
    expect(deleteObjectMock).toHaveBeenCalledWith(processing.originalKey);
  });

  it('permanently fails + deletes when a near-duplicate exists in the project', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.findProjectPhashes.mockResolvedValue([
      { imageId: 'other', phash: await computePhash(jpeg) },
    ]);

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: false, reason: 'duplicate' });
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
    expect(deleteObjectMock).toHaveBeenCalledWith(processing.originalKey);
    expect(repoMock.markReady).not.toHaveBeenCalled();
  });

  it('keeps and processes a near-duplicate when the action is "flag"', async () => {
    config.MEDIA_DEDUP_ACTION = 'flag';
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.findProjectPhashes.mockResolvedValue([
      { imageId: 'other', phash: await computePhash(jpeg) },
    ]);

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: true, derivatives: 8 });
    expect(repoMock.markReady).toHaveBeenCalledTimes(1);
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('rethrows a transient error WITHOUT marking the row failed (let BullMQ retry)', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockRejectedValue(new Error('R2 timeout'));

    await expect(processMedia(job('img-1'))).rejects.toThrow('R2 timeout');
    expect(repoMock.markFailed).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});
