import { describe, expect, it } from 'vitest';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { deserializeTraceContext, serializeTraceContext } from '../src/propagation.js';

const parent = '00-11111111111111111111111111111111-2222222222222222-01';

describe('safe queue propagation', () => {
  it('extracts a valid parent while dropping baggage and tracestate', () => {
    const ctx = deserializeTraceContext(ROOT_CONTEXT, JSON.stringify({
      traceparent: parent, baggage: 'phone=9876543210', tracestate: 'secret=value', providerToken: 'private',
    }));
    expect(trace.getSpanContext(ctx)).toMatchObject({
      traceId: '11111111111111111111111111111111', spanId: '2222222222222222', isRemote: true,
    });
    expect(serializeTraceContext(ctx)).toBe(JSON.stringify({ traceparent: parent }));
  });

  it.each([
    '', 'broken', 'null', '[]', '{}', JSON.stringify({ traceparent: '00-00000000000000000000000000000000-2222222222222222-01' }),
    JSON.stringify({ traceparent: '00-11111111111111111111111111111111-0000000000000000-01' }),
    JSON.stringify({ traceparent: ['00-11111111111111111111111111111111-2222222222222222-01'] }),
    JSON.stringify({ traceparent: parent, extra: 'x'.repeat(256) }),
  ])('ignores invalid legacy metadata %s', (metadata) => {
    expect(deserializeTraceContext(ROOT_CONTEXT, metadata)).toBe(ROOT_CONTEXT);
  });
});
