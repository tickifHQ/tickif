import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ add: vi.fn(), schedule: vi.fn(), close: vi.fn() }));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return { add: mocks.add, upsertJobScheduler: mocks.schedule, close: mocks.close };
  }),
}));

describe('designer experience refresh queue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await (await import('../src/index.js')).closeQueues();
  });

  it('registers one daily UTC sweep and requests startup catch-up', async () => {
    const queue = await import('../src/index.js');
    await queue.scheduleDesignerExperienceRefresh();
    expect(mocks.schedule).toHaveBeenCalledWith(
      'designer-experience-sweep',
      { pattern: '0 0 * * *', tz: 'UTC' },
      { name: 'sweep-designer-experience', data: {} },
    );
    expect(mocks.add).toHaveBeenCalledWith(
      'sweep-designer-experience',
      {},
      {
        jobId: 'designer-experience-startup',
      },
    );
  });

  it('retains a successful year marker but permits catch-up after terminal failure', async () => {
    const queue = await import('../src/index.js');
    await queue.enqueueDesignerExperienceRefresh(2026);
    await queue.enqueueDesignerExperienceRefresh(2027);
    expect(mocks.add).toHaveBeenNthCalledWith(
      1,
      'refresh-designer-experience',
      { year: 2026 },
      {
        jobId: 'designer-experience-2026',
        removeOnComplete: { age: 400 * 24 * 3600 },
        removeOnFail: true,
      },
    );
    expect(mocks.add).toHaveBeenNthCalledWith(
      2,
      'refresh-designer-experience',
      { year: 2027 },
      expect.objectContaining({ jobId: 'designer-experience-2027' }),
    );
  });
});
