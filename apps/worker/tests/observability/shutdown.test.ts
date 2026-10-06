import { afterEach, describe, expect, it, vi } from 'vitest';
import { finishWithin } from '../../src/observability/shutdown.js';

describe('worker shutdown deadline', () => {
  afterEach(() => vi.useRealTimers());

  it('bounds stuck drain/export work and clears the deadline timer', async () => {
    vi.useFakeTimers();
    const result = finishWithin(new Promise<void>(() => undefined), 3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes promptly and propagates cleanup failures', async () => {
    vi.useFakeTimers();
    await expect(finishWithin(Promise.resolve(), 3_000)).resolves.toBe(true);
    await expect(finishWithin(Promise.reject(new Error('cleanup')), 3_000)).rejects.toThrow(
      'cleanup',
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
