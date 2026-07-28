import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/queue', () => ({
  enqueueSearchDesignerDelete: vi.fn(async () => undefined),
  enqueueSearchDesignerIndex: vi.fn(async () => undefined),
  enqueueSearchProjectDelete: vi.fn(async () => undefined),
  enqueueSearchProjectIndex: vi.fn(async () => undefined),
}));

vi.mock('../../src/search/outbox-repository.js', () => ({
  listPendingSearchProjectionEvents: vi.fn(),
}));

const queue = await import('@repo/queue');
const repository = await import('../../src/search/outbox-repository.js');
const { dispatchSearchProjectionOutbox } = await import('../../src/search/outbox-dispatcher.js');

beforeEach(() => vi.clearAllMocks());

describe('search projection outbox dispatcher', () => {
  it('queues each pending row independently and reports enqueue failures', async () => {
    vi.mocked(repository.listPendingSearchProjectionEvents).mockResolvedValue([
      {
        sequence: 1n,
        entityKind: 'project',
        entityId: '11111111-1111-4111-8111-111111111111',
        operation: 'index',
        sourceUpdatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        sequence: 2n,
        entityKind: 'designer',
        entityId: '22222222-2222-4222-8222-222222222222',
        operation: 'delete',
        sourceUpdatedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);
    vi.mocked(queue.enqueueSearchDesignerDelete).mockRejectedValueOnce(
      new Error('Redis unavailable'),
    );

    await expect(dispatchSearchProjectionOutbox()).resolves.toEqual({
      enqueued: 1,
      failed: 1,
    });

    expect(queue.enqueueSearchProjectIndex).toHaveBeenCalledWith({
      projectId: '11111111-1111-4111-8111-111111111111',
      updatedAtEpoch: new Date('2026-07-01T00:00:00.000Z').getTime(),
      eventId: '1',
      outboxSequence: '1',
    });
  });
});
