import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { getLogContext } from '@repo/logger/server';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../src/lib/logger.js', () => ({ log: logger }));
vi.mock('@repo/config', () => ({ isProduction: true }));

import { requestTelemetry, type RequestTelemetryVariables } from '../../src/lib/request-telemetry.js';
import { onError } from '../../src/lib/errors.js';

describe('structured API request telemetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isolates concurrent request context and returns server-owned IDs', async () => {
    const contexts: Record<string, unknown>[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const app = new Hono<{ Variables: RequestTelemetryVariables }>().use('*', requestTelemetry);
    app.get('/projects/:id', async (c) => {
      if (c.req.param('id') === 'first') await gate;
      else release?.();
      contexts.push({ ...getLogContext() });
      return c.json({ requestId: c.get('requestId') });
    });
    const responses = await Promise.all([
      app.request('/projects/first?token=secret', { headers: { 'X-Request-Id': 'spoofed' } }),
      app.request('/projects/second'),
    ]);
    const ids = responses.map((response) => response.headers.get('x-request-id'));
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain('spoofed');
    expect(contexts.map((value) => value.requestId).sort()).toEqual([...ids].sort());
    expect(contexts.every((value) => value.route === '/projects/:id')).toBe(true);
    expect(JSON.stringify(contexts)).not.toContain('secret');
    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('records final error status once while preserving the response envelope', async () => {
    const app = new Hono<{ Variables: RequestTelemetryVariables }>().use('*', requestTelemetry).onError(onError);
    app.get('/fail', () => { throw new Error('unexpected failure'); });
    const response = await app.request('/fail');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: 'internal_error', message: 'Internal server error' } });
    expect(logger.error.mock.calls.filter(([fields]) => fields.event === 'http.request.error')).toHaveLength(1);
    expect(logger.error.mock.calls.filter(([fields]) => fields.event === 'http.request.completed')).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'http.request.completed', status: 500 }));
  });

  it('uses a bounded unmatched template and suppresses successful probes/relay traffic', async () => {
    const app = new Hono<{ Variables: RequestTelemetryVariables }>().use('*', requestTelemetry);
    app.get('/livez', (c) => c.text('ok'));
    app.post('/api/telemetry/logs', (c) => c.text('ok'));
    await app.request('/livez');
    await app.request('/api/telemetry/logs', { method: 'POST' });
    expect(logger.info).not.toHaveBeenCalled();
    await app.request('/private-person-slug');
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });
});
