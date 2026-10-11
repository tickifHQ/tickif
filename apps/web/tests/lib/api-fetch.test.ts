import { afterEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => ({
  inject: vi.fn(),
  active: vi.fn().mockReturnValue('active-render'),
}));
vi.mock('@opentelemetry/api', () => ({
  context: { active: spies.active },
  propagation: { inject: spies.inject },
}));
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_API_URL: 'https://tickif.example' } }));

import { apiFetch } from '../../src/lib/api-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('typed API fetch context', () => {
  it.each(['room', 'city', 'locality', 'material', 'finish', 'property_subtype', 'budget_band'])(
    'bypasses an already warmed browser catalog cache for %s after new terms are seeded',
    async (kind) => {
      const cachedCatalog = { terms: ['old-choice'] };
      let currentCatalog = cachedCatalog;
      const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(Response.json(init?.cache === 'no-store' ? currentCatalog : cachedCatalog)),
      );
      vi.stubGlobal('fetch', fetch);
      const request = new Request(`https://tickif.example/api/taxonomy/terms?kind=${kind}`, {
        cache: 'force-cache',
      });
      expect(await (await apiFetch(request)).json()).toEqual(cachedCatalog);
      currentCatalog = { terms: ['old-choice', 'new-choice'] };
      expect(await (await apiFetch(request)).json()).toEqual(currentCatalog);
      expect(fetch).toHaveBeenLastCalledWith(request, {
        cache: 'no-store',
        credentials: 'include',
      });
    },
  );

  it.each([
    ['https://other.example/api/taxonomy/terms?kind=material', 'GET'],
    ['https://tickif.example/api/taxonomy/terms?kind=material', 'POST'],
    ['https://tickif.example/api/projects?kind=city', 'GET'],
    ['https://tickif.example/api/taxonomy/terms?kind=theme', 'GET'],
  ])(
    'preserves explicit cache settings outside changing typed catalog GETs: %s %s',
    async (url, method) => {
      const fetch = vi.fn().mockResolvedValue(Response.json({}));
      vi.stubGlobal('fetch', fetch);
      await apiFetch(url, { method, cache: 'force-cache' });
      expect(fetch).toHaveBeenCalledWith(url, {
        method,
        cache: 'force-cache',
        credentials: 'include',
      });
    },
  );

  it('injects authoritative SSR context while preserving explicit cookies', async () => {
    vi.stubGlobal('window', undefined);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    spies.inject.mockImplementation(
      (
        _context,
        carrier: Headers,
        setter: { set: (carrier: Headers, key: string, value: string) => void },
      ) => {
        setter.set(carrier, 'traceparent', 'authoritative-context');
        setter.set(carrier, 'baggage', 'private-provider-data');
      },
    );
    await apiFetch('https://tickif.example/api/projects', {
      headers: {
        cookie: 'session=forwarded',
        traceparent: 'forged',
        baggage: 'private',
        tracestate: 'private',
      },
    });
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
    await apiFetch('https://tickif.example/api/projects', {
      headers: { 'x-request-id': 'client' },
    });
    expect(spies.inject).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('https://tickif.example/api/projects', {
      headers: { 'x-request-id': 'client' },
      credentials: 'include',
    });
  });

  it('keeps requests working when the telemetry context provider fails', async () => {
    vi.stubGlobal('window', undefined);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    spies.inject.mockImplementation(() => {
      throw new Error('Provider failed');
    });
    await expect(apiFetch('https://tickif.example/api/projects')).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
