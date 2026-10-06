import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { runWithLogContext } from '@repo/logger/server';
import { context, metrics, propagation, SpanKind, SpanStatusCode, trace } from '@repo/telemetry/node';
import { log } from './logger.js';

export type RequestTelemetryVariables = { requestId: string };

const tracer = trace.getTracer('tickif.api');
const meter = metrics.getMeter('tickif.api');
const requests = meter.createCounter('http.server.requests', { unit: '{request}', description: 'Completed API requests' });
const duration = meter.createHistogram('http.server.request.duration', {
  unit: 's',
  description: 'Duration of API requests',
  advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10] },
});

const quietPaths = new Set(['/livez', '/readyz', '/health']);

/** Static templates only: arbitrary unmatched URLs never become metric labels. */
function requestRoute(c: Parameters<MiddlewareHandler>[0]): string {
  const route = matchedRoutes(c).slice().reverse().find((entry) => entry.method !== 'ALL');
  return route?.path ?? 'unmatched';
}

export const requestTelemetry: MiddlewareHandler<{ Variables: RequestTelemetryVariables }> = async (c, next) => {
  const requestId = randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);

  // This endpoint is itself an event sink. Do not generate request logs/spans for it.
  if (c.req.path === '/api/telemetry/logs') {
    await next();
    return;
  }

  const start = performance.now();
  const method = /^[A-Z]{1,16}$/.test(c.req.method) ? c.req.method : '_OTHER';
  const route = requestRoute(c);
  const run = async () => runWithLogContext({ requestId, route, method }, async () => {
    await next();
    const status = c.res.status;
    const attributes = { 'http.request.method': method, 'http.route': route, 'http.response.status_code': status, 'url.scheme': new URL(c.req.url).protocol.slice(0, -1) };
    const span = trace.getActiveSpan();
    span?.setAttributes(attributes);
    span?.updateName(`${method} ${route}`);
    if (status >= 500) span?.setStatus({ code: SpanStatusCode.ERROR });
    const elapsedSeconds = (performance.now() - start) / 1_000;
    duration.record(elapsedSeconds, attributes);
    requests.add(1, attributes);
    if (!quietPaths.has(c.req.path) || status >= 400) {
      const fields = { event: 'http.request.completed', status, durationMs: elapsedSeconds * 1_000 };
      if (status >= 500) log.error(fields);
      else if (status === 429) log.warn(fields);
      else log.info(fields);
    }
  });

  if (quietPaths.has(c.req.path)) {
    await run();
    return;
  }

  // Only W3C trace headers are extracted. Browser-supplied baggage never enters logs.
  const parent = propagation.extract(context.active(), {
    traceparent: c.req.header('traceparent'),
    tracestate: c.req.header('tracestate'),
  });
  await tracer.startActiveSpan(`${method} ${route}`, { kind: SpanKind.SERVER }, parent, async (span) => {
    try {
      await run();
    } finally {
      span.end();
    }
  });
};
