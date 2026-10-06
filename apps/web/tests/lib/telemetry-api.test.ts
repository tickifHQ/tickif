import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogRecord } from '@repo/logger';

vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_API_URL: 'https://tickif.example' } }));

import { sendBrowserLogs, toTelemetryEvent } from '../../src/lib/telemetry-api';

function record(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    schema_version: 1, timestamp: '2026-10-05T00:00:00.000Z', level: 50,
    severity_text: 'ERROR', service: 'tickif-browser', environment: 'browser',
    version: 'release-123', event: 'browser.error', message: 'Rendering failed', attributes: {},
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('browser telemetry transport', () => {
  it('sends typed JSON without cookies, trace claims, or arbitrary attributes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: 1 }), { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    await sendBrowserLogs([record({
      trace_id: 'untrusted', span_id: 'untrusted',
      attributes: { userId: 'private', component: 'root.boundary', errorCode: 'digest-123' },
    })]);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://tickif.example/api/telemetry/logs');
    expect(init).toMatchObject({ credentials: 'omit', keepalive: true });
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]).toMatchObject({ release: 'release-123', attributes: { component: 'root.boundary', errorCode: 'digest-123' } });
    expect(JSON.stringify(body)).not.toMatch(/userId|trace_id|span_id/);
  });

  it('bounds Unicode batch bytes independently of event count', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ accepted: 1 }), { status: 202 })));
    vi.stubGlobal('fetch', fetch);
    const records = Array.from({ length: 10 }, () => record({
      message: '界'.repeat(1_000),
      attributes: { error: { name: 'Error', message: '界'.repeat(1_000), stack: '界'.repeat(4_000) } },
    }));
    await sendBrowserLogs(records);
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    for (const [, init] of fetch.mock.calls) {
      expect(new TextEncoder().encode(String(init.body)).byteLength).toBeLessThanOrEqual(24 * 1024);
    }
  });

  it('drops failures and rate limits without retries or rejected promises', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendBrowserLogs([record()])).resolves.toBeUndefined();
    await expect(sendBrowserLogs([record()])).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('filters low severity records and maps fatal errors to the ingress error level', () => {
    expect(toTelemetryEvent(record({ severity_text: 'INFO' }))).toBeUndefined();
    expect(toTelemetryEvent(record({ severity_text: 'FATAL' }))?.level).toBe('error');
  });

  it('does not send invalid timestamps', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await sendBrowserLogs([record({ timestamp: 'invalid' })]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
