import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']);
const QUEUES = new Set(['media', 'sms', 'google-reviews', 'search-index', 'verification-email', 'billing-lifecycle']);
const JOBS = new Set([
  'send-sms', 'send-booking-requested-sms', 'sweep-booking-notifications', 'process-media',
  'refresh-google-reviews', 'sweep-google-reviews', 'index-project', 'delete-project',
  'index-designer', 'delete-designer', 'reindex-all', 'send-verification-email',
  'sweep-verification-notifications', 'sweep-billing-lifecycle',
]);
const NUMERIC_KEYS = new Set([
  'http.response.status_code', 'http.status_code', 'http.request.body.size',
  'messaging.batch.message_count', 'bullmq.job.attempts_made', 'attempt', 'attempts',
]);
const CATEGORY_KEYS = new Set(['outcome', 'state', 'reason', 'error.type', 'db.operation.name', 'db.operation']);

/** Deliberately reject unknown fields instead of trying to enumerate every secret. */
export function sanitizeTraceAttributes(attributes: Attributes | undefined): Attributes {
  const safe: Attributes = {};
  for (const [key, value] of Object.entries(attributes ?? {}).slice(0, 64)) {
    if (value === undefined || Array.isArray(value)) continue;
    if (NUMERIC_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
    } else if (['http.request.method', 'http.method'].includes(key) && typeof value === 'string') {
      safe[key] = METHODS.has(value) ? value : 'OTHER';
    } else if (key === 'http.route' && typeof value === 'string' && isRouteTemplate(value)) {
      safe[key] = value;
    } else if (['db.system', 'db.system.name'].includes(key) && typeof value === 'string') {
      safe[key] = ['postgresql', 'redis'].includes(value) ? value : 'other';
    } else if (key === 'messaging.system' && value === 'bullmq') {
      safe[key] = value;
    } else if (['queue', 'queue.name', 'messaging.destination.name', 'bullmq.queue.name'].includes(key) && typeof value === 'string' && QUEUES.has(value)) {
      safe[key] = value;
    } else if (['job', 'job.name', 'job.type', 'bullmq.job.name'].includes(key) && typeof value === 'string' && JOBS.has(value)) {
      safe[key] = value;
    } else if (CATEGORY_KEYS.has(key) && typeof value === 'string' && /^[a-zA-Z_][a-zA-Z_.-]{0,63}$/.test(value)) {
      safe[key] = value;
    }
  }
  return safe;
}

function isRouteTemplate(value: string): boolean {
  // Routes come from the framework's matched pattern, never req.url. Dynamic
  // IDs, query values, email addresses and long numerical paths are forbidden.
  return value.length <= 200 && (value === 'unmatched' ||
    (/^\/[a-zA-Z0-9_:/.*()[\]-]*$/.test(value) && !/\d{7,}/.test(value)));
}

export function safeSpanName(name: string, attributes?: Attributes, scope?: string): string {
  if (scope === 'tickif.api') {
    const method = attributes?.['http.request.method'] ?? attributes?.['http.method'];
    const route = attributes?.['http.route'];
    if (typeof method === 'string' && METHODS.has(method) && typeof route === 'string' && isRouteTemplate(route)) {
      return `${method} ${route}`;
    }
    return 'HTTP request';
  }
  if (scope?.includes('pg')) return 'db.query';
  if (scope?.includes('ioredis')) return 'redis.command';
  if (scope?.includes('http') || scope?.includes('undici')) {
    const method = attributes?.['http.request.method'] ?? attributes?.['http.method'];
    return typeof method === 'string' && METHODS.has(method) ? `HTTP ${method}` : 'HTTP request';
  }
  if (scope?.includes('next')) return 'next.operation';
  if (scope?.includes('bullmq')) {
    const operation = name.replace(/^bullmq\./, '').split(/[ .:/]/)[0] ?? '';
    return /^[A-Za-z_-]{1,32}$/.test(operation) ? `bullmq.${operation}` : 'bullmq.operation';
  }
  return /^[A-Za-z_][A-Za-z_. -]{0,95}$/.test(name) ? name : 'application.operation';
}

export function sanitizeReadableSpan(span: ReadableSpan): ReadableSpan {
  const attributes = sanitizeTraceAttributes(span.attributes);
  return {
    name: safeSpanName(span.name, attributes, span.instrumentationScope.name),
    kind: span.kind,
    spanContext: () => ({ ...span.spanContext(), traceState: undefined }),
    parentSpanContext: span.parentSpanContext ? { ...span.parentSpanContext, traceState: undefined } : undefined,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    attributes,
    status: { code: span.status.code },
    // Exception messages/stacks can contain URLs, SQL and provider secrets.
    // Detailed safe error reporting belongs to @repo/logger.
    events: span.events.filter((event) => event.name === 'exception').slice(0, 8).map((event) => ({
      name: 'exception', time: event.time, attributes: { 'exception.type': 'Error' }, droppedAttributesCount: 0,
    })),
    links: [],
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

/** Copy spans at the export boundary, preserving the original SDK span/context. */
export class PrivateSpanExporter implements SpanExporter {
  constructor(private readonly exporter: SpanExporter) {}

  export(spans: ReadableSpan[], callback: Parameters<SpanExporter['export']>[1]): void {
    this.exporter.export(spans.map(sanitizeReadableSpan), callback);
  }

  shutdown(): Promise<void> { return this.exporter.shutdown(); }
  forceFlush(): Promise<void> { return this.exporter.forceFlush?.() ?? Promise.resolve(); }
}

export function sanitizeAttribute(key: string, value: AttributeValue): Attributes {
  return sanitizeTraceAttributes({ [key]: value });
}
