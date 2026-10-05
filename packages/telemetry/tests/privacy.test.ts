import { describe, expect, it } from 'vitest';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { safeSpanName, sanitizeReadableSpan, sanitizeTraceAttributes } from '../src/privacy.js';

describe('trace export privacy', () => {
  it('keeps operational dimensions and rejects sensitive or unknown attributes', () => {
    expect(sanitizeTraceAttributes({
      'http.method': 'POST', 'http.route': '/api/projects/:id', 'http.status_code': 500,
      'db.system': 'postgresql', queue: 'sms', 'bullmq.job.name': 'send-sms',
      'url.full': 'https://site/api?token=secret', 'http.url': '/?code=123456',
      'http.request.header.authorization': 'Bearer secret', 'db.statement': 'SELECT secret',
      'db.query.parameters': ['123456'], 'bullmq.job.id': 'otp-9876543210-digest',
      'bullmq.job.data': '{"code":"123456"}', 'private.value': 'secret',
    })).toEqual({
      'http.method': 'POST', 'http.route': '/api/projects/:id', 'http.status_code': 500,
      'db.system': 'postgresql', queue: 'sms', 'bullmq.job.name': 'send-sms',
    });
  });

  it('copies spans and excludes names, events, links, status details and exception text that carry secrets', () => {
    const span: ReadableSpan = {
      name: 'GET /callback?token=private', kind: SpanKind.SERVER,
      spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
      startTime: [0, 0], endTime: [1, 0], duration: [1, 0], ended: true,
      resource: resourceFromAttributes({ 'service.name': 'tickif-api' }),
      instrumentationScope: { name: '@opentelemetry/instrumentation-http' },
      attributes: { 'http.method': 'GET', 'http.url': 'https://private?secret=value' },
      status: { code: SpanStatusCode.ERROR, message: 'secret=value' },
      events: [{ name: 'exception', time: [0, 0], attributes: { 'exception.message': 'phone 9876543210', 'exception.stacktrace': 'secret=value' } }],
      links: [{ context: { traceId: '3'.repeat(32), spanId: '4'.repeat(16), traceFlags: 1 }, attributes: { token: 'private' } }],
      droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0,
    };
    const exported = sanitizeReadableSpan(span);
    expect(exported.name).toBe('HTTP GET');
    expect(exported.attributes).toEqual({ 'http.method': 'GET' });
    expect(exported.events[0]?.attributes).toEqual({ 'exception.type': 'Error' });
    expect(exported.links).toEqual([]);
    expect(exported.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(JSON.stringify(exported)).not.toContain('secret');
    expect(span.attributes['http.url']).toContain('secret');
  });

  it('replaces raw query/command and framework span names with stable categories', () => {
    expect(safeSpanName('SELECT secret FROM users', undefined, '@opentelemetry/instrumentation-pg')).toBe('db.query');
    expect(safeSpanName('GET /?secret=token', undefined, 'next.js')).toBe('next.operation');
    expect(safeSpanName('process sms otp-9876543210', undefined, 'bullmq.tickif-worker')).toBe('bullmq.process');
    expect(safeSpanName('GET /api/projects/private?token=value', {
      'http.method': 'GET', 'http.route': '/api/projects/:id',
    }, 'tickif.api')).toBe('GET /api/projects/:id');
  });
});
