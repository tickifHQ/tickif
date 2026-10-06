import { ROOT_CONTEXT } from '@opentelemetry/api';
import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const getter: TextMapGetter<Record<string, string>> = { keys: (carrier) => Object.keys(carrier), get: (carrier, key) => carrier[key] };
const setter: TextMapSetter<Record<string, string>> = { set: (carrier, key, value) => { carrier[key] = value; } };
const w3c = new W3CTraceContextPropagator();

function validTraceparent(value: unknown): value is string {
  if (typeof value !== 'string' || !/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(value)) return false;
  const parts = value.split('-');
  return parts[1] !== '0'.repeat(32) && parts[2] !== '0'.repeat(16);
}

/** A single bounded traceparent; no baggage, tracestate or arbitrary carrier fields. */
export class PrivateTracePropagator implements TextMapPropagator {
  fields(): string[] { return ['traceparent']; }

  inject<C>(ctx: Context, carrier: C, target: TextMapSetter<C>): void {
    const safe: Record<string, string> = {};
    w3c.inject(ctx, safe, setter);
    if (validTraceparent(safe.traceparent)) target.set(carrier, 'traceparent', safe.traceparent);
  }

  extract<C>(ctx: Context, carrier: C, source: TextMapGetter<C>): Context {
    const value = source.get(carrier, 'traceparent');
    if (!validTraceparent(value)) return ctx;
    return w3c.extract(ctx, { traceparent: value }, getter);
  }
}

export const privateTracePropagator = new PrivateTracePropagator();

export function serializeTraceContext(ctx: Context): string {
  const carrier: Record<string, string> = {};
  privateTracePropagator.inject(ctx, carrier, setter);
  return JSON.stringify(carrier);
}

export function deserializeTraceContext(activeContext: Context, metadata: unknown): Context {
  if (typeof metadata !== 'string' || metadata.length > 256) return activeContext;
  try {
    const carrier: unknown = JSON.parse(metadata);
    if (typeof carrier !== 'object' || carrier === null || Array.isArray(carrier)) return activeContext;
    const value = (carrier as Record<string, unknown>).traceparent;
    if (!validTraceparent(value)) return activeContext;
    return privateTracePropagator.extract(activeContext, { traceparent: value }, getter);
  } catch { return activeContext; }
}

/** Scheduled/background work deliberately starts from this root rather than old registration context. */
export const freshTraceContext = ROOT_CONTEXT;
