import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserLogger } from '../src/browser.js';
import type { LogRecord } from '../src/index.js';

const options = { service: 'tickif-browser', environment: 'test', version: 'abc123' };

afterEach(() => vi.useRealTimers());

describe('browser logger', () => {
  it('sends normalized events through the injected sender and ignores disabled exports', async () => {
    const send = vi.fn<(events: LogRecord[]) => Promise<void>>().mockResolvedValue();
    const logger = createBrowserLogger({ ...options, send });
    logger.info({ event: 'ignored.info' });
    logger.warn({ event: 'browser.warning', authorization: 'do-not-export' });
    await logger.flush();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0][0]?.attributes).toEqual({});
    const disabled = createBrowserLogger({ ...options, send, enabled: false });
    disabled.error({ event: 'disabled.error' });
    await disabled.flush();
    expect(send).toHaveBeenCalledOnce();
  });

  it('keeps a bounded queue while a single send is active', async () => {
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const send = vi.fn<(events: LogRecord[]) => Promise<void>>()
      .mockReturnValueOnce(blocked).mockResolvedValue(undefined);
    const logger = createBrowserLogger({ ...options, send, maxQueueSize: 2, batchSize: 1 });
    logger.error({ event: 'first' });
    await Promise.resolve();
    for (let i = 0; i < 10; i++) logger.warn({ event: `queued.${i}` });
    expect(send).toHaveBeenCalledOnce();
    release();
    await logger.flush();
    await logger.flush();
    await logger.flush();
    expect(send.mock.calls.map((call) => call[0][0]?.event)).toEqual(['first', 'queued.8', 'queued.9']);
  });

  it('disables export after a deadline without accumulating stalled requests', async () => {
    vi.useFakeTimers();
    const send = vi.fn<(events: LogRecord[]) => Promise<void>>().mockReturnValue(new Promise(() => undefined));
    const logger = createBrowserLogger({ ...options, send, flushTimeoutMs: 100 });
    logger.error({ event: 'timeout' });
    const flushing = logger.flush();
    await vi.advanceTimersByTimeAsync(100);
    await flushing;
    logger.error({ event: 'after.timeout' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledOnce();
  });

  it('drops rejected sends without retries or recursive logging', async () => {
    const send = vi.fn<(events: LogRecord[]) => Promise<void>>().mockRejectedValue(new Error('offline'));
    const logger = createBrowserLogger({ ...options, send });
    logger.error({ event: 'browser.error' });
    await expect(logger.flush()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
  });
});
