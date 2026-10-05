import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import * as authModule from '@repo/auth';
import { app } from '../../src/app.js';

const originalOrigins = config.TELEMETRY_BROWSER_ALLOWED_ORIGINS;

afterEach(() => {
  config.TELEMETRY_BROWSER_ALLOWED_ORIGINS = originalOrigins;
  vi.restoreAllMocks();
});

describe('application CORS preflights', () => {
  it.each([
    ['/api/auth/phone-number/send-otp', 'true'],
    ['/api/billing/change-preview', 'true'],
    ['/api/projects', 'true'],
    ['/api/telemetry/logs', null],
  ])('returns an empty successful preflight for %s without session lookup', async (path, credentials) => {
    config.TELEMETRY_BROWSER_ALLOWED_ORIGINS = ['http://localhost:3000'];
    const session = vi.spyOn(authModule, 'getSession').mockRejectedValue(new Error('Session lookup must not run'));
    const response = await app.request(path, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(response.headers.get('access-control-allow-credentials')).toBe(credentials);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
    expect(session).not.toHaveBeenCalled();
  });
});
