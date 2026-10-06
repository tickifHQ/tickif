import pino from 'pino';
import type { DestinationStream } from 'pino';
import { getLogContext } from './context';
import { facade, makeRecord } from './record';
import type { Logger, LoggerOptions, LogRecord, TraceContext } from './types';

export { getLogContext, runWithLogContext } from './context';
export type { Logger, LogFields, LogContext, TraceContext } from './types';

export type ServerLoggerOptions = LoggerOptions & {
  getTraceContext?: () => TraceContext | undefined;
  destination?: DestinationStream;
  flushTimeoutMs?: number;
};

export function createServerLogger(options: ServerLoggerOptions): Logger {
  const destination = options.destination ?? pino.destination({ dest: 1, sync: false, maxLength: 1_048_576 });
  let sinkFailed = false;
  if ('on' in destination && typeof destination.on === 'function') {
    destination.on('error', () => { sinkFailed = true; });
  }
  const output = pino({
    level: options.level ?? 'info', base: undefined, timestamp: false,
    serializers: {},
  }, destination);
  // stdout is the sole log export path; no Pino transport or OTel log exporter.
  const flush = () => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, options.flushTimeoutMs ?? 1_000);
    try {
      output.flush(() => { clearTimeout(timer); resolve(); });
    } catch { clearTimeout(timer); resolve(); }
  });
  return facade(options.level ?? 'info', {}, (level, fields, message) => {
    if (sinkFailed) return;
    let trace: TraceContext | undefined;
    try { trace = options.getTraceContext?.(); } catch { /* Missing context must not drop the log. */ }
    // Pino emits the numeric level itself; do not duplicate it in the payload.
    const record: Partial<LogRecord> = makeRecord(options, level, { ...getLogContext(), ...fields }, message, trace);
    delete record.level;
    output[level](record);
  }, flush);
}
