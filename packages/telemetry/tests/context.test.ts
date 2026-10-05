import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, metrics, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getTraceContext } from '../src/node.js';
import { PrivateSpanExporter, sanitizeTraceAttributes } from '../src/privacy.js';
import { AggregationTemporality, InMemoryMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { privateTracePropagator } from '../src/propagation.js';
import { createBullMQTelemetry } from '../src/bullmq.js';

const exporter = new InMemorySpanExporter();
const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
const reader = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 60_000 });
const sdk = new NodeSDK({
  autoDetectResources: false, logRecordProcessors: [], instrumentations: [],
  spanProcessors: [new SimpleSpanProcessor(new PrivateSpanExporter(exporter))],
  textMapPropagator: privateTracePropagator,
  metricReaders: [reader],
  views: [{ instrumentName: '*', attributesProcessors: [{ process: sanitizeTraceAttributes }] }],
});
beforeAll(() => sdk.start());
afterAll(() => sdk.shutdown());

describe('active context', () => {
  it('returns undefined outside a span and follows nested spans per call', async () => {
    expect(getTraceContext()).toBeUndefined();
    const tracer = trace.getTracer('tickif-test');
    await tracer.startActiveSpan('outer', async (outer) => {
      const initial = getTraceContext();
      expect(initial?.span_id).toBe(outer.spanContext().spanId);
      await tracer.startActiveSpan('inner', async (inner) => {
        expect(getTraceContext()?.span_id).toBe(inner.spanContext().spanId);
        expect(getTraceContext()?.trace_id).toBe(initial?.trace_id);
        inner.end();
      });
      expect(getTraceContext()).toEqual(initial);
      outer.end();
    });
    expect(getTraceContext()).toBeUndefined();
  });

  it('isolates overlapping async work and rejects invalid active identifiers', async () => {
    const tracer = trace.getTracer('tickif-test');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = tracer.startActiveSpan('first', async (span) => {
      const initial = getTraceContext();
      await gate;
      expect(getTraceContext()).toEqual(initial);
      span.end();
    });
    await tracer.startActiveSpan('second', async (span) => {
      expect(getTraceContext()?.span_id).toBe(span.spanContext().spanId);
      release?.();
      span.end();
    });
    await first;
    const invalid = trace.setSpanContext(context.active(), { traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 0 });
    context.with(invalid, () => expect(getTraceContext()).toBeUndefined());
  });

  it('captures native BullMQ spans without unsafe job IDs, options, results or exception details', () => {
    const adapter = createBullMQTelemetry('tickif-worker');
    const span = adapter.tracer.startSpan('process sms otp-9876543210-abc');
    span.setAttributes({ 'bullmq.job.id': 'otp-9876543210-abc', 'bullmq.queue.name': 'sms', 'bullmq.job.name': 'send-sms' });
    span.addEvent('job.result', { token: 'private' });
    span.recordException(new Error('SMS provider token private 9876543210'));
    span.end();
    const queued = exporter.getFinishedSpans().find((item) => item.name === 'bullmq.process');
    expect(queued?.attributes).toEqual({ 'bullmq.queue.name': 'sms', 'bullmq.job.name': 'send-sms' });
    expect(JSON.stringify(queued)).not.toContain('9876543210');
    expect(JSON.stringify(queued)).not.toContain('private');
  });

  it('drops personal metric labels and rejects unknown queue values before aggregation', async () => {
    const counter = metrics.getMeter('tickif-test').createCounter('tickif.test.requests');
    counter.add(1, { queue: 'sms', 'job.type': 'send-sms', outcome: 'success', reason: 'stalled', phone: '9876543210' });
    counter.add(1, { queue: 'private-queue-9876543210', outcome: 'success', request_id: 'private' });
    await reader.forceFlush();
    const metric = metricExporter.getMetrics().flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics).find((item) => item.descriptor.name === 'tickif.test.requests');
    expect(metric?.dataPoints.map((point) => point.attributes)).toEqual([
      { queue: 'sms', 'job.type': 'send-sms', outcome: 'success', reason: 'stalled' }, { outcome: 'success' },
    ]);
  });
});
