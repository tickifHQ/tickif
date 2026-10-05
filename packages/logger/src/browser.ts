import { facade, makeRecord } from './record';
import type { Logger, LoggerOptions, LogRecord } from './types';

export type { Logger, LogFields, LogRecord } from './types';

export type BrowserLoggerOptions = LoggerOptions & {
  send: (events: LogRecord[]) => Promise<void>;
  enabled?: boolean;
  maxQueueSize?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  flushTimeoutMs?: number;
};

function limit(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback;
}

/** Memory-only best-effort export. A failing sender never creates another event. */
export function createBrowserLogger(options: BrowserLoggerOptions): Logger {
  const queue: LogRecord[] = [];
  const capacity = limit(options.maxQueueSize, 50, 100);
  const batchSize = limit(options.batchSize, 5, 10);
  const timeout = limit(options.flushTimeoutMs, 3_000, 10_000);
  const interval = limit(options.flushIntervalMs, 5_000, 60_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  let disposed = false;

  function schedule(): void {
    if (timer || disposed || !queue.length) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, interval);
    // Node tests/SSR imports must not keep a process alive; browsers return a number.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  }

  async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (inFlight) return inFlight;
    if (disposed || !queue.length || options.enabled === false) return;
    const batch = queue.splice(0, batchSize);
    let timedOut = false;
    const operation = Promise.resolve().then(() => options.send(batch)).catch(() => undefined);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const bounded = Promise.race([
      operation,
      new Promise<void>((resolve) => {
        deadline = setTimeout(() => { timedOut = true; disposed = true; queue.length = 0; resolve(); }, timeout);
      }),
    ]).then(() => {
      if (deadline) clearTimeout(deadline);
      inFlight = undefined;
      // A timed-out promise cannot be canceled through this transport interface.
      // Disable export so it cannot create an unbounded number of stalled sends.
      if (!timedOut) schedule();
    });
    inFlight = bounded;
    return bounded;
  }

  return facade(options.level ?? 'warn', {}, (level, fields, message) => {
    if (options.enabled === false || disposed) return;
    if (queue.length === capacity) queue.shift();
    queue.push(makeRecord(options, level, fields, message));
    schedule();
    if (queue.length >= batchSize || level === 'error' || level === 'fatal') void flush();
  }, flush);
}
