import type { BatchObservableCallback } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startQueueMetrics } from '../../src/observability/queue-metrics.js';

const fake = vi.hoisted(() => ({
  enabled: true,
  read: vi.fn(),
  close: vi.fn(),
  remove: vi.fn(),
  callback: undefined as BatchObservableCallback | undefined,
}));
vi.mock('@repo/config/telemetry', () => ({
  getTelemetryConfig: () => ({
    TELEMETRY_ENABLED: true,
    TELEMETRY_QUEUE_METRICS_ENABLED: fake.enabled,
  }),
}));
vi.mock('@repo/queue/metrics', () => ({
  readQueueMetrics: fake.read,
  closeQueueMetrics: fake.close,
}));
vi.mock('../../src/observability/logger.js', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@repo/telemetry/node', () => ({
  metrics: {
    getMeter: () => ({
      createObservableGauge: () => ({}),
      addBatchObservableCallback: (callback: BatchObservableCallback) => {
        fake.callback = callback;
      },
      removeBatchObservableCallback: fake.remove,
    }),
  },
}));

describe('singleton queue metrics publisher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    vi.clearAllMocks();
    fake.enabled = true;
    fake.callback = undefined;
    fake.close.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('does not create an observer on ordinary worker replicas', async () => {
    fake.enabled = false;
    const publisher = startQueueMetrics();
    expect(fake.read).not.toHaveBeenCalled();
    expect(fake.callback).toBeUndefined();
    await publisher.stop();
  });

  it('avoids overlapping Redis polls and removes callbacks on shutdown', async () => {
    let release: ((value: unknown[]) => void) | undefined;
    fake.read.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    const publisher = startQueueMetrics();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.read).toHaveBeenCalledTimes(1);
    release?.([]);
    await publisher.stop();
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('omits stale snapshots during an observation outage rather than reporting zero', async () => {
    fake.read.mockResolvedValueOnce([
      { queue: 'media', counts: { waiting: 2 }, nextWaitingCreatedAt: 99_000 },
    ]);
    fake.read.mockRejectedValue(new Error('redis unavailable'));
    const publisher = startQueueMetrics();
    await vi.advanceTimersByTimeAsync(0);
    const observe = vi.fn();
    fake.callback?.({ observe });
    expect(observe).toHaveBeenCalledTimes(2);
    observe.mockClear();
    await vi.advanceTimersByTimeAsync(61_000);
    fake.callback?.({ observe });
    expect(observe).not.toHaveBeenCalled();
    await publisher.stop();
  });
});
