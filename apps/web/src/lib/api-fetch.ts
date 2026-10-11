import { context, propagation } from '@opentelemetry/api';
import { taxonomyNeedsFreshRead } from '@repo/contracts';
import { env } from '@/env';

function freshBrowserTaxonomyRequest(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (method.toUpperCase() !== 'GET') return false;
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const taxonomyUrl = new URL(
    `${env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/api/taxonomy/terms`,
    window.location.origin,
  );
  return (
    url.origin === taxonomyUrl.origin &&
    url.pathname === taxonomyUrl.pathname &&
    taxonomyNeedsFreshRead(url.searchParams.get('kind'))
  );
}

/** Forward SSR context only through our configured, typed API client. */
export function apiFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (typeof window !== 'undefined')
    return fetch(input, {
      ...init,
      ...(freshBrowserTaxonomyRequest(input, init) ? { cache: 'no-store' } : {}),
      credentials: 'include',
    });
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  // Caller-supplied trace headers are not authoritative; use the active context.
  headers.delete('traceparent');
  headers.delete('tracestate');
  headers.delete('baggage');
  try {
    propagation.inject(context.active(), headers, {
      set: (carrier, key, value) => {
        if (key === 'traceparent') carrier.set(key, value);
      },
    });
  } catch {
    // A failed context provider must not block application requests.
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}
