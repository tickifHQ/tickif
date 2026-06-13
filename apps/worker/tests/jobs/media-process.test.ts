import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { processMedia } from '../../src/jobs/media-process.js';
import type { MediaProcessJob } from '../../src/connection.js';

function fakeJob(data: MediaProcessJob): Job<MediaProcessJob> {
  return { id: 'job-1', data } as Job<MediaProcessJob>;
}

describe('processMedia', () => {
  it('processes a job and reports success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await processMedia(fakeJob({ imageId: 'img-1', storageKey: 'k/orig.jpg' }));

    expect(result).toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('img-1'));
    log.mockRestore();
  });
});
