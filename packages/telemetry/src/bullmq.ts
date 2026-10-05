import { context } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';
import { BullMQOtel } from 'bullmq-otel';
import type { Span, Telemetry, Attributes, AttributeValue, Exception, Time } from 'bullmq';
import { deserializeTraceContext, serializeTraceContext } from './propagation';
import { safeSpanName, sanitizeTraceAttributes } from './privacy';

class PrivateQueueSpan implements Span<Context> {
  constructor(private readonly delegate: Span<Context>) {}
  setSpanOnContext(ctx: Context): Context { return this.delegate.setSpanOnContext(ctx); }
  setAttribute(key: string, value: AttributeValue): void {
    this.setAttributes({ [key]: value });
  }
  setAttributes(attributes: Attributes): void {
    // BullMQ supports sparse arrays while OTel attributes do not. Array data is
    // never useful in our allowed operational fields, so discard it first.
    const scalars = Object.fromEntries(Object.entries(attributes).filter(([, value]) => !Array.isArray(value)));
    this.delegate.setAttributes(sanitizeTraceAttributes(scalars));
  }
  addEvent(_name: string, _attributes?: Attributes): void {
    // Native events can serialize job options, payloads and provider results.
  }
  recordException(_exception: Exception, time?: Time): void {
    this.delegate.recordException({ name: 'Error', message: 'Job processing failed' }, time);
  }
  end(): void { this.delegate.end(); }
}

/** Native BullMQ carrier integration, with untrusted legacy metadata failing open. */
export function createBullMQTelemetry(scope: string): Telemetry<Context> {
  const native = new BullMQOtel({ tracerName: `bullmq.${scope}`, enableMetrics: false });
  return {
    tracer: {
      startSpan: (name, options, ctx) => new PrivateQueueSpan(
        native.tracer.startSpan(safeSpanName(name, undefined, 'bullmq'), options, ctx),
      ),
    },
    contextManager: {
      active: () => context.active(),
      with: (ctx, fn) => context.with(ctx, fn),
      getMetadata: serializeTraceContext,
      fromMetadata: deserializeTraceContext,
    },
    // Worker owns queue measurements; native metrics are deliberately omitted.
  };
}
