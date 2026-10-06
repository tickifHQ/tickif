import { LOG_LIMITS, RESERVED_FIELDS, sanitizeLogFields, sanitizeText } from './sanitize';
import type { ConfiguredLogLevel, LogFields, Logger, LoggerOptions, LogLevel, LogRecord, TraceContext } from './types';

const LEVELS: Record<LogLevel, number> = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const SEVERITIES = { debug: 'DEBUG', info: 'INFO', warn: 'WARN', error: 'ERROR', fatal: 'FATAL' } as const;

export function enabled(level: LogLevel, minimum: ConfiguredLogLevel): boolean {
  return minimum !== 'silent' && LEVELS[level] >= LEVELS[minimum];
}

export function makeRecord(
  options: LoggerOptions,
  level: LogLevel,
  fields: LogFields,
  message: string | undefined,
  trace?: TraceContext,
): LogRecord {
  const attributes = sanitizeLogFields(fields);
  const candidate = attributes.event;
  const event = typeof candidate === 'string' && /^[a-zA-Z][a-zA-Z\d_.-]{0,95}$/.test(candidate)
    ? candidate : 'application.log';
  for (const key of RESERVED_FIELDS) delete attributes[key];
  const record: LogRecord = {
    schema_version: 1,
    timestamp: (options.now?.() ?? new Date()).toISOString(),
    level: LEVELS[level], severity_text: SEVERITIES[level],
    service: sanitizeText(options.service, 96),
    environment: sanitizeText(options.environment, 32),
    version: sanitizeText(options.version, 96),
    event, message: sanitizeText(message ?? event), attributes,
  };
  if (trace && /^[\da-f]{32}$/i.test(trace.trace_id) && !/^0+$/.test(trace.trace_id)
    && /^[\da-f]{16}$/i.test(trace.span_id) && !/^0+$/.test(trace.span_id)) {
    record.trace_id = trace.trace_id.toLowerCase();
    record.span_id = trace.span_id.toLowerCase();
    if (Number.isInteger(trace.trace_flags) && trace.trace_flags !== undefined
      && trace.trace_flags >= 0 && trace.trace_flags <= 255) record.trace_flags = trace.trace_flags;
  }
  if (new TextEncoder().encode(JSON.stringify(record)).length > LOG_LIMITS.eventBytes) {
    record.attributes = { truncated: true };
    record.message = record.message.slice(0, 512);
  }
  return record;
}

export function facade(
  minimum: ConfiguredLogLevel,
  bindings: LogFields,
  write: (level: LogLevel, fields: LogFields, message?: string) => void,
  flush: () => Promise<void>,
): Logger {
  function log(level: LogLevel, fields: LogFields, message?: string): void {
    if (!enabled(level, minimum)) return;
    try { write(level, { ...bindings, ...sanitizeLogFields(fields) }, message); } catch { /* Logging never fails a use-case. */ }
  }
  return {
    debug: (fields, message) => log('debug', fields, message),
    info: (fields, message) => log('info', fields, message),
    warn: (fields, message) => log('warn', fields, message),
    error: (fields, message) => log('error', fields, message),
    fatal: (fields, message) => log('fatal', fields, message),
    child: (fields) => facade(minimum, { ...bindings, ...sanitizeLogFields(fields) }, write, flush),
    isLevelEnabled: (level) => enabled(level, minimum),
    flush,
  };
}
