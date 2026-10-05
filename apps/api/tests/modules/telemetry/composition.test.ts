import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import * as authModule from '@repo/auth';
import { app } from '../../../src/app.js';

const originalEnabled = config.TELEMETRY_BROWSER_INGEST_ENABLED;
const originalOrigins = config.TELEMETRY_BROWSER_ALLOWED_ORIGINS;

describe('telemetry app composition', () => {
  beforeEach(() => {
    config.TELEMETRY_BROWSER_INGEST_ENABLED = true;
    config.TELEMETRY_BROWSER_ALLOWED_ORIGINS = ['http://localhost:3000'];
  });
  afterEach(() => {
    config.TELEMETRY_BROWSER_INGEST_ENABLED = originalEnabled;
    config.TELEMETRY_BROWSER_ALLOWED_ORIGINS = originalOrigins;
    vi.restoreAllMocks();
  });

  it('accepts a public browser failure when session resolution is unavailable', async () => {
    const session = vi.spyOn(authModule, 'getSession').mockRejectedValue(new Error('auth unavailable'));
    const response = await app.request('/api/telemetry/logs', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ level: 'error', event: 'login.failed', message: 'failed', timestamp: '2026-10-05T10:00:00.000Z' }] }),
    });
    expect(response.status).toBe(202);
    expect(session).not.toHaveBeenCalled();
  });

  it('retains session middleware on normal API routes', async () => {
    const session = vi.spyOn(authModule, 'getSession').mockResolvedValue(null);
    const response = await app.request('/api/visitors/me');
    expect(session).toHaveBeenCalledOnce();
    expect(response.status).not.toBe(500);
  });

  it('allows relay-specific preflight origins without granting credentialed API access', async () => {
    config.TELEMETRY_BROWSER_ALLOWED_ORIGINS = ['https://telemetry-only.example'];
    const headers = { Origin: 'https://telemetry-only.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' };
    const relay = await app.request('/api/telemetry/logs', { method: 'OPTIONS', headers });
    expect(relay.status).toBe(204);
    expect(relay.headers.get('access-control-allow-origin')).toBe('https://telemetry-only.example');
    expect(relay.headers.get('access-control-allow-credentials')).toBeNull();
    const ordinary = await app.request('/api/projects', { method: 'OPTIONS', headers });
    expect(ordinary.status).toBe(204);
    expect(ordinary.headers.get('access-control-allow-origin')).toBeNull();
  });
});
