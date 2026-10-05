import { context, isSpanContextValid, trace } from '@opentelemetry/api';

export { context, trace, metrics, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode } from '@opentelemetry/api';
export type { Attributes, Context, Span, Meter, Tracer } from '@opentelemetry/api';
export { initTelemetry, shutdownTelemetry } from './lifecycle';
export type { InitTelemetryOptions } from './lifecycle';
export { createBullMQTelemetry } from './bullmq';
export { deserializeTraceContext, serializeTraceContext, freshTraceContext } from './propagation';
export { sanitizeTraceAttributes } from './privacy';

/** Lookup per log call so child loggers follow the current nested span. */
export function getTraceContext(): { trace_id: string; span_id: string; trace_flags?: number } | undefined {
  const current = trace.getSpanContext(context.active());
  if (!current || !isSpanContextValid(current)) return undefined;
  return { trace_id: current.traceId, span_id: current.spanId, trace_flags: current.traceFlags };
}
