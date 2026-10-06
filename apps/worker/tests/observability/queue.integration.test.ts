import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { config } from '@repo/config';
import { createBullMQTelemetry, trace, getTraceContext } from '@repo/telemetry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

type Payload = { value: number };
const prefix = 'tickif-observability-integration';
const name = 'media';
const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null };
const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
  metricReaders: [],
  instrumentations: [],
});
let queue: Queue<Payload>;
let events: QueueEvents;
let worker: Worker<Payload>;

beforeAll(async () => {
  sdk.start();
  queue = new Queue<Payload>(name, {
    connection,
    prefix,
    telemetry: createBullMQTelemetry('test-producer'),
  });
  events = new QueueEvents(name, { connection, prefix });
  worker = new Worker<Payload>(
    name,
    async (job) => ({ value: job.data.value, ...getTraceContext() }),
    { connection, prefix, telemetry: createBullMQTelemetry('test-consumer'), concurrency: 2 },
  );
  worker.on('error', () => undefined);
  await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()]);
});

afterAll(async () => {
  await worker?.close();
  await events?.close();
  // Only this test's explicit Redis prefix is removed; application queues are untouched.
  await queue?.obliterate({ force: true });
  await queue?.close();
  await sdk.shutdown();
});

describe('native BullMQ trace propagation', () => {
  it('continues the direct producer trace and drains legacy/malformed-metadata jobs', async () => {
    let parentTraceId: string | undefined;
    const traced = await trace.getTracer('test').startActiveSpan('request', async (span) => {
      parentTraceId = span.spanContext().traceId;
      try {
        return await queue.add('process-media', { value: 1 });
      } finally {
        span.end();
      }
    });
    const value: unknown = await traced.waitUntilFinished(events, 5_000);
    expect(value).toMatchObject({ value: 1, trace_id: parentTraceId });
    // An uninstrumented old producer writes no carrier; malformed metadata also fails open.
    const legacy = new Queue<Payload>(name, { connection, prefix });
    try {
      const old = await legacy.add('process-media', { value: 2 });
      const broken = await legacy.add(
        'process-media',
        { value: 3 },
        { telemetry: { metadata: '{invalid' } },
      );
      await expect(old.waitUntilFinished(events, 5_000)).resolves.toMatchObject({ value: 2 });
      await expect(broken.waitUntilFinished(events, 5_000)).resolves.toMatchObject({ value: 3 });
      expect(old.opts.telemetry).toBeUndefined();
      expect(JSON.stringify(traced.data)).toBe('{"value":1}');
    } finally {
      await legacy.close();
    }
  });
});
