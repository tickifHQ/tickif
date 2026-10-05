import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';

const settings = vi.hoisted(() => ({
  TELEMETRY_BROWSER_INGEST_ENABLED: true,
  TELEMETRY_BROWSER_ALLOWED_ORIGINS: ['http://localhost:3000'],
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@repo/config', () => ({ config: settings, isProduction: false }));
vi.mock('../../../src/lib/logger.js', () => ({ log: logger }));

import { onError } from '../../../src/lib/errors.js';
import { telemetryRoutes } from '../../../src/modules/telemetry/routes.js';
import { createBrowserLimiter } from '../../../src/modules/telemetry/service.js';

const app = new OpenAPIHono().onError(onError).route('/api/telemetry', telemetryRoutes);
const event = { level: 'error', event: 'unhandled', message: 'failed', timestamp: '2026-10-05T10:00:00.000Z' };
const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };

function send(input: unknown, requestHeaders: Record<string, string> = headers) {
  return app.request('/api/telemetry/logs', { method: 'POST', headers: requestHeaders, body: JSON.stringify(input) });
}

describe('anonymous browser telemetry relay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.TELEMETRY_BROWSER_INGEST_ENABLED = true;
  });

  it('accepts an anonymous event and assigns its source/category', async () => {
    const response = await send({ events: [{ ...event, page: '/designer/private-person-slug', release: 'web-build-1' }] });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
      event: 'browser.unhandled', telemetrySource: 'browser', sourceService: 'tickif-browser', page: '/designer/*', browserRelease: 'web-build-1',
    }), 'failed');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-person-slug');
  });

  it.each([undefined, 'null', 'http://localhost:3000/', 'https://untrusted.example'])('rejects missing or unapproved Origin (%s)', async (origin) => {
    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (origin) requestHeaders.Origin = origin;
    expect((await send({ events: [event] }, requestHeaders)).status).toBe(403);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('has an independent ingress kill switch', async () => {
    settings.TELEMETRY_BROWSER_INGEST_ENABLED = false;
    expect((await send({ events: [event] })).status).toBe(404);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('requires uncompressed JSON', async () => {
    expect((await send({ events: [event] }, { ...headers, 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send({ events: [event] }, { ...headers, 'Content-Encoding': 'gzip' })).status).toBe(415);
  });

  it('rejects forged identity and excessive batches before logging', async () => {
    expect((await send({ events: [{ ...event, userId: 'forged' }] })).status).toBe(422);
    expect((await send({ events: Array.from({ length: 21 }, () => event) })).status).toBe(422);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('enforces actual UTF-8 bytes even with a dishonest Content-Length', async () => {
    const response = await send({ events: [{ ...event, message: '☃'.repeat(12_000) }] }, { ...headers, 'Content-Length': '1' });
    expect(response.status).toBe(413);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('bounds chunked request bodies without Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(20_000));
        controller.enqueue(new Uint8Array(20_000));
        controller.close();
      },
    });
    const request = new Request('http://localhost/api/telemetry/logs', { method: 'POST', headers, body: stream, ...{ duplex: 'half' } });
    expect((await app.request(request)).status).toBe(413);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('bounds per-origin, global and key-count budgets and resets expired windows', () => {
    let now = 0;
    const allow = createBrowserLimiter(() => now);
    for (let index = 0; index < 60; index++) expect(allow('a')).toBe(true);
    expect(allow('a')).toBe(false);
    for (let index = 0; index < 60; index++) expect(allow('b')).toBe(true);
    expect(allow('c')).toBe(false);
    now = 60_000;
    expect(allow('a')).toBe(true);
  });
});
