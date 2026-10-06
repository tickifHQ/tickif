import { context, propagation } from '@opentelemetry/api';

/** Forward SSR context only through our configured, typed API client. */
export function apiFetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> {
  if (typeof window !== 'undefined') return fetch(input, { ...init, credentials: 'include' });
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  // Caller-supplied trace headers are not authoritative; use the active context.
  headers.delete('traceparent');
  headers.delete('tracestate');
  headers.delete('baggage');
  try {
    propagation.inject(context.active(), headers, {
      set: (carrier, key, value) => { if (key === 'traceparent') carrier.set(key, value); },
    });
  } catch {
    // A failed context provider must not block application requests.
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}
