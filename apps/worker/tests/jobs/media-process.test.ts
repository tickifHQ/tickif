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
    WATERMARK_TEXT: 'tickif',
    WATERMARK_OPACITY: 0.22,
    WATERMARK_SCALE: 0.16,
    WATERMARK_ROTATION: -30,
    WATERMARK_REVISION: 'wm-v2',
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
  refreshReadyDerivatives: vi.fn(async () => true),
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

const job = (imageId: string, mode?: 'reprocess'): Job<{ imageId: string; mode?: 'reprocess' }> =>
  ({ id: 'j1', data: { imageId, mode } }) as Job<{ imageId: string; mode?: 'reprocess' }>;

const processing = {
  id: 'img-1',
  projectId: 'proj-1',
  originalKey: 'originals/proj-1/abc',
  contentType: 'image/jpeg',
  derivatives: [
    {
      variant: 'thumb',
      format: 'webp' as const,
      key: 'derivatives/proj-1/img-1/thumb.webp',
      width: 320,
      height: 240,
    },
  ],
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

  it('regenerates derivatives for an already-ready image in reprocess mode', async () => {
    repoMock.getImageForProcessing.mockResolvedValue({ ...processing, status: 'ready' });
    getObjectMock.mockResolvedValue(jpeg);

    const result = await processMedia(job('img-1', 'reprocess'));

    expect(result).toEqual({ ok: true, derivatives: 8 });
    expect(putObjectMock).toHaveBeenCalledTimes(8);
    expect(repoMock.refreshReadyDerivatives).toHaveBeenCalledTimes(1);
    expect(repoMock.findProjectPhashes).not.toHaveBeenCalled();
    expect(repoMock.markReady).not.toHaveBeenCalled();
    expect(repoMock.markFailed).not.toHaveBeenCalled();
    expect(deleteObjectMock).toHaveBeenCalledWith('derivatives/proj-1/img-1/thumb.webp');
    expect(deleteObjectMock).not.toHaveBeenCalledWith(processing.originalKey);
  });

  it('does not overlap reprocessing with initial processing', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);

    expect(await processMedia(job('img-1', 'reprocess'))).toEqual({
      ok: true,
      skipped: 'not-ready',
    });
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('keeps the existing ready image intact when reprocessing finds invalid bytes', async () => {
    repoMock.getImageForProcessing.mockResolvedValue({ ...processing, status: 'ready' });
    getObjectMock.mockResolvedValue(Buffer.from('not an image'));

    expect(await processMedia(job('img-1', 'reprocess'))).toEqual({ ok: false, reason: 'corrupt' });
    expect(repoMock.markFailed).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(repoMock.refreshReadyDerivatives).not.toHaveBeenCalled();
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
