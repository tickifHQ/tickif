import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { config } from '@repo/config';
import { errorResponseSchema, telemetryLogsRequestSchema, telemetryLogsResponseSchema } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { createBrowserLimiter, ingestBrowserLogs, recordBrowserRejection } from './service.js';

export const BROWSER_TELEMETRY_MAX_BYTES = 32 * 1_024;
const allowBatch = createBrowserLimiter();

/** Route-local checks run before the OpenAPI validator consumes the request body. */
export const browserTelemetryGuard: MiddlewareHandler = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!config.TELEMETRY_BROWSER_INGEST_ENABLED) {
    recordBrowserRejection('disabled');
    throw AppError.notFound('Telemetry ingestion is disabled');
  }
  const origin = c.req.header('origin');
  // Origin must exactly match a configured origin: no credentials, paths or wildcard matching.
  if (!origin || !config.TELEMETRY_BROWSER_ALLOWED_ORIGINS.includes(origin)) {
    recordBrowserRejection('origin');
    throw AppError.forbidden('Origin is not permitted');
  }
  if (c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json' ||
      (c.req.header('content-encoding') && c.req.header('content-encoding') !== 'identity')) {
    recordBrowserRejection('content_type');
    throw new AppError('unsupported_media_type', 'Use an uncompressed JSON body', 415);
  }
  if (!allowBatch(origin)) {
    recordBrowserRejection('rate_limit');
    c.header('Retry-After', '60');
    throw AppError.tooManyRequests();
  }
  const contentLength = c.req.header('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > BROWSER_TELEMETRY_MAX_BYTES)) {
    recordBrowserRejection('body_size');
    throw new AppError('payload_too_large', 'Telemetry batch is too large', 413);
  }

  // Count actual bytes even without Content-Length (or with a dishonest length).
  const reader = c.req.raw.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new AppError('request_timeout', 'Telemetry body timed out', 408)), 2_000);
      timeout.unref();
    });
    if (reader) {
      while (true) {
        const chunk = await Promise.race([reader.read(), deadline]);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > BROWSER_TELEMETRY_MAX_BYTES) {
          recordBrowserRejection('body_size');
          throw new AppError('payload_too_large', 'Telemetry batch is too large', 413);
        }
        chunks.push(chunk.value);
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Reconstitute only the bounded body for the contracts-backed JSON validator.
    c.req.raw = new Request(c.req.raw, { body });
  } catch (error) {
    if (error instanceof AppError && error.status === 408) recordBrowserRejection('timeout');
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (reader) {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  await next();
};

const logsRoute = createRoute({
  method: 'post',
  path: '/logs',
  tags: ['Telemetry'],
  summary: 'Accept bounded anonymous browser warning and error events',
  middleware: [browserTelemetryGuard] as const,
  request: { body: { required: true, content: { 'application/json': { schema: telemetryLogsRequestSchema } } } },
  responses: {
    202: { description: 'Events accepted', content: { 'application/json': { schema: telemetryLogsResponseSchema } } },
    403: { description: 'Origin rejected', content: { 'application/json': { schema: errorResponseSchema } } },
    404: { description: 'Ingestion disabled', content: { 'application/json': { schema: errorResponseSchema } } },
    408: { description: 'Request timed out', content: { 'application/json': { schema: errorResponseSchema } } },
    413: { description: 'Body limit exceeded', content: { 'application/json': { schema: errorResponseSchema } } },
    415: { description: 'JSON required', content: { 'application/json': { schema: errorResponseSchema } } },
    422: { description: 'Invalid events', content: { 'application/json': { schema: errorResponseSchema } } },
    429: { description: 'Ingestion budget exhausted', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

export const telemetryRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(logsRoute, (c) => c.json(ingestBrowserLogs(c.req.valid('json')), 202));
