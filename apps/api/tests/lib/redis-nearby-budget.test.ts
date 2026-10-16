import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  eval: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@repo/config', () => ({ config: { REDIS_URL: 'redis://localhost:6379' } }));
vi.mock('../../src/lib/logger.js', () => ({ log: { error: vi.fn() } }));

vi.mock('ioredis', () => ({
  default: class {
    constructor() {
      mocks.create();
    }
    connect = mocks.connect;
    eval = mocks.eval;
    disconnect = mocks.disconnect;
    on = mocks.on;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  mocks.connect.mockResolvedValue(undefined);
  mocks.eval.mockResolvedValue(1);
});

afterEach(() => vi.useRealTimers());

describe('nearby lookup budget', () => {
  it('enforces the shared budget and fails closed on Redis command failure', async () => {
    const { consumeNearbyLookupBudget } = await import('../../src/lib/redis.js');
    mocks.eval
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(31)
      .mockRejectedValueOnce(new Error('offline'));
    expect(await consumeNearbyLookupBudget()).toBe(true);
    expect(await consumeNearbyLookupBudget()).toBe(false);
    expect(await consumeNearbyLookupBudget()).toBe(false);
  });

  it('recovers after a transient outage without spending quota during the reconnect cooldown', async () => {
    const { consumeNearbyLookupBudget } = await import('../../src/lib/redis.js');
    expect(await consumeNearbyLookupBudget()).toBe(true);
    const onError = mocks.on.mock.calls.find(([event]) => event === 'error')?.[1] as (
      error: Error,
    ) => void;
    onError(new Error('temporary outage'));
    expect(await consumeNearbyLookupBudget()).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.eval).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(31_000);
    expect(await consumeNearbyLookupBudget()).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.eval).toHaveBeenCalledTimes(2);

    onError(new Error('late event from the old connection'));
    expect(await consumeNearbyLookupBudget()).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('retries an initial connection rejection after the cooldown', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('offline at startup'));
    mocks.eval.mockRejectedValueOnce(new Error('offline at startup'));
    const { consumeNearbyLookupBudget } = await import('../../src/lib/redis.js');
    expect(await consumeNearbyLookupBudget()).toBe(false);
    expect(await consumeNearbyLookupBudget()).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(await consumeNearbyLookupBudget()).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});
