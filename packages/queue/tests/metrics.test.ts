import type { QueueOptions } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeQueueMetrics, readQueueMetrics } from '../src/metrics.js';

const fake = vi.hoisted(() => ({
  construct: vi.fn(),
  close: vi.fn(),
  waiting: vi.fn(),
  counts: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue(name: string, options: QueueOptions) {
    fake.construct(name, options);
    return { on: vi.fn(), close: fake.close, getWaiting: fake.waiting, getJobCounts: fake.counts };
  }),
}));

afterEach(async () => {
  await closeQueueMetrics();
  vi.clearAllMocks();
});

describe('bounded queue observation', () => {
  it('uses isolated fail-fast clients and exports no job payloads', async () => {
    fake.counts.mockResolvedValue({
      waiting: 1,
      active: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      prioritized: 0,
    });
    fake.waiting.mockResolvedValue([
      { timestamp: 1_000, data: { phone: '919876543210', code: '123456' } },
    ]);
    const snapshot = await readQueueMetrics();
    expect(snapshot).toHaveLength(6);
    expect(snapshot[0]).toMatchObject({ queue: 'media', nextWaitingCreatedAt: 1_000 });
    expect(JSON.stringify(snapshot)).not.toContain('919876543210');
    expect(JSON.stringify(snapshot)).not.toContain('123456');
    expect(fake.waiting).toHaveBeenCalledWith(0, 0);
    expect(fake.construct).toHaveBeenCalledWith(
      'sms',
      expect.objectContaining({
        connection: expect.objectContaining({ maxRetriesPerRequest: 1, connectTimeout: 3_000 }),
        skipMetasUpdate: true,
      }),
    );
  });
});
