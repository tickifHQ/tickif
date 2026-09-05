import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumersAreReady, createWorkerReadinessProbe } from '../../src/health/readiness.js';

function dependencies() {
  return {
    postgres: vi.fn(async () => true),
    search: vi.fn(async () => true),
    consumers: vi.fn(async () => true),
  };
}

afterEach(() => vi.useRealTimers());

describe('worker deployment readiness', () => {
  it('requires Postgres, search and consumers independently', async () => {
    for (const name of ['postgres', 'search', 'consumers'] as const) {
      const checks = dependencies();
      checks[name].mockResolvedValue(false);
      await expect(createWorkerReadinessProbe(checks)()).resolves.toBe(false);
    }
    await expect(createWorkerReadinessProbe(dependencies())()).resolves.toBe(true);
  });

  it('rejects bad Redis credentials without returning their error text', async () => {
    const checks = dependencies();
    checks.consumers.mockImplementation(() =>
      consumersAreReady([
        {
          isRunning: () => true,
          waitUntilReady: async () => {
            throw new Error('WRONGPASS synthetic-secret');
          },
          client: Promise.resolve({ status: 'reconnecting', ping: async () => 'PONG' }),
        },
      ]),
    );
    await expect(createWorkerReadinessProbe(checks)()).resolves.toBe(false);
  });

  it('bounds hung dependencies, deduplicates retries, and recovers after reconnection', async () => {
    vi.useFakeTimers();
    const checks = dependencies();
    checks.postgres.mockRejectedValueOnce(new Error('database unavailable'));
    let reconnect: (value: boolean) => void = () => undefined;
    checks.consumers.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        reconnect = resolve;
      }),
    );
    const probe = createWorkerReadinessProbe(checks);
    const first = probe();
    await vi.advanceTimersByTimeAsync(1_750);
    await expect(first).resolves.toBe(false);
    const second = probe();
    await vi.advanceTimersByTimeAsync(1_750);
    await expect(second).resolves.toBe(false);
    expect(checks.consumers).toHaveBeenCalledTimes(1);
    reconnect(true);
    await vi.runAllTimersAsync();
    await expect(probe()).resolves.toBe(true);
    expect(checks.consumers).toHaveBeenCalledTimes(2);
  });

  it('checks initialized, running consumers and authenticated Redis PONG responses', async () => {
    const redis = { status: 'ready', ping: vi.fn(async () => 'PONG') };
    const consumer = {
      isRunning: vi.fn(() => true),
      waitUntilReady: vi.fn(async () => undefined),
      client: Promise.resolve(redis),
    };
    await expect(consumersAreReady([consumer])).resolves.toBe(true);
    expect(consumer.waitUntilReady).toHaveBeenCalled();
    redis.status = 'reconnecting';
    await expect(consumersAreReady([consumer])).resolves.toBe(false);
    redis.status = 'ready';
    redis.ping.mockResolvedValueOnce('NOAUTH');
    await expect(consumersAreReady([consumer])).resolves.toBe(false);
    consumer.isRunning.mockReturnValue(false);
    await expect(consumersAreReady([consumer])).resolves.toBe(false);
    await expect(consumersAreReady([])).resolves.toBe(false);
  });
});
