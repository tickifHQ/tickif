import { afterEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({ inject: vi.fn(), active: vi.fn().mockReturnValue('active-render') }));
vi.mock('@opentelemetry/api', () => ({ context: { active: spies.active }, propagation: { inject: spies.inject } }));

import { apiFetch } from '../../src/lib/api-fetch';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('typed API fetch context', () => {
  it('injects authoritative SSR context while preserving explicit cookies', async () => {
    vi.stubGlobal('window', undefined);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    spies.inject.mockImplementation((_context, carrier: Headers, setter: { set: (carrier: Headers, key: string, value: string) => void }) => {
      setter.set(carrier, 'traceparent', 'authoritative-context');
      setter.set(carrier, 'baggage', 'private-provider-data');
    });
    await apiFetch('https://tickif.example/api/projects', { headers: { cookie: 'session=forwarded', traceparent: 'forged', baggage: 'private', tracestate: 'private' } });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('traceparent')).toBe('authoritative-context');
    expect(headers.get('cookie')).toBe('session=forwarded');
    expect(headers.has('baggage')).toBe(false);
    expect(headers.has('tracestate')).toBe(false);
    expect(init.credentials).toBe('include');
  });

  it('does not claim browser trace context or change browser request headers', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await apiFetch('https://tickif.example/api/projects', { headers: { 'x-request-id': 'client' } });
    expect(spies.inject).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://tickif.example/api/projects', { headers: { 'x-request-id': 'client' }, credentials: 'include' });
  });

  it('keeps requests working when the telemetry context provider fails', async () => {
    vi.stubGlobal('window', undefined);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    spies.inject.mockImplementation(() => { throw new Error('Provider failed'); });
    await expect(apiFetch('https://tickif.example/api/projects')).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
