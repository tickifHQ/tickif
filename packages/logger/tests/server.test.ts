import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createServerLogger } from '../src/server.js';
import type { LogRecord, TraceContext } from '../src/index.js';

function setup(getTraceContext?: () => TraceContext | undefined) {
  const lines: string[] = [];
  const logger = createServerLogger({
    service: 'tickif-api', environment: 'staging', version: 'abc123', level: 'debug',
    now: () => new Date('2026-01-01T00:00:00Z'), getTraceContext,
    destination: { write: (line) => { lines.push(line); } },
  });
  return { logger, lines, records: () => lines.map((line) => JSON.parse(line) as LogRecord) };
}

describe('server logger', () => {
  it('emits one bounded JSON record and reserves envelope identity', async () => {
    const { logger, lines, records } = setup();
    logger.info({ event: 'request.completed', service: 'spoof', level: 99, trace_id: 'spoof', durationMs: 7 }, 'Request completed');
    await logger.flush();
    expect(lines).toHaveLength(1);
    expect(records()[0]).toEqual({
      schema_version: 1, timestamp: '2026-01-01T00:00:00.000Z', level: 30, severity_text: 'INFO',
      service: 'tickif-api', environment: 'staging', version: 'abc123',
      event: 'request.completed', message: 'Request completed', attributes: { durationMs: 7 },
    });
  });

  it('looks up active trace context for each child log call', () => {
    const getTraceContext = vi.fn<() => TraceContext | undefined>()
      .mockReturnValueOnce({ trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), trace_flags: 1 })
      .mockReturnValueOnce({ trace_id: 'a'.repeat(32), span_id: 'c'.repeat(16) })
      .mockReturnValueOnce({ trace_id: '0'.repeat(32), span_id: 'c'.repeat(16) });
    const { logger, records } = setup(getTraceContext);
    const child = logger.child({ component: 'media', api_key: 'do-not-export' });
    child.info({ event: 'media.started' });
    child.info({ event: 'media.finished' });
    child.info({ event: 'media.idle' });
    expect(records().map((record) => record.span_id)).toEqual(['b'.repeat(16), 'c'.repeat(16), undefined]);
    expect(records()[0]?.attributes).toEqual({ component: 'media' });
  });

  it('enforces a UTF-8 encoded event bound even for wide multibyte data', () => {
    const { logger, lines, records } = setup();
    logger.error({ event: 'error.large', values: Array.from({ length: 20 }, () => '😀'.repeat(2_000)) }, '\u0000'.repeat(2_048));
    expect(new TextEncoder().encode(lines[0]).length).toBeLessThanOrEqual(8_193);
    expect(records()[0]?.attributes).toEqual({ truncated: true });
  });

  it('does not throw if sink or trace lookup fails and filters levels', () => {
    const write = vi.fn(() => { throw new Error('broken sink'); });
    const logger = createServerLogger({ service: 'api', environment: 'test', version: 'test', level: 'warn',
      getTraceContext: () => { throw new Error('broken context'); }, destination: { write } });
    logger.debug({ event: 'filtered' });
    expect(write).not.toHaveBeenCalled();
    expect(logger.isLevelEnabled('error')).toBe(true);
    expect(() => logger.error({ event: 'application.failure' })).not.toThrow();
    expect(write).toHaveBeenCalledOnce();
  });

  it('absorbs asynchronous destination errors and stops writing to a failed sink', () => {
    const destination = Object.assign(new EventEmitter(), { write: vi.fn() });
    const logger = createServerLogger({ service: 'api', environment: 'test', version: 'test', destination });
    expect(() => destination.emit('error', new Error('asynchronous sink failure'))).not.toThrow();
    logger.error({ event: 'after.sink.failure' });
    expect(destination.write).not.toHaveBeenCalled();
  });
});
