import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  initTelemetry,
  shutdownTelemetry,
  parseTelemetryConfig,
  trace,
} from '../dist/telemetry.js';

// Exercise the production ESM bundle/loader with a loopback fixture and in-memory
// exporters. This never requires app credentials, Redis, a database or SigNoz.
const exported = [];
const exporter = {
  export(spans, callback) {
    exported.push(...spans);
    callback({ code: 0 });
  },
  async shutdown() {},
  async forceFlush() {},
};
const metricExporter = {
  export(_metrics, callback) {
    callback({ code: 0 });
  },
  async shutdown() {},
  async forceFlush() {},
};
assert(
  initTelemetry({
    service: 'tickif-worker',
    instrumentation: 'all',
    config: parseTelemetryConfig({
      NODE_ENV: 'test',
      TELEMETRY_ENABLED: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
      OTEL_TRACES_SAMPLER_ARG: '1',
    }),
    spanExporter: exporter,
    metricExporter,
  }),
  'SDK must initialize from the production bundle',
);

const http = await import('node:http');
const server = http.createServer((_request, response) => response.end('ok'));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
try {
  await trace.getTracer('worker-smoke').startActiveSpan('worker.smoke', async (span) => {
    try {
      span.setAttribute('db.statement', 'fixture-private-value');
      span.recordException(new Error('fixture-private-value'));
      await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${address.port}/smoke?token=fixture-private-value`, (response) => {
            response.resume();
            response.on('end', resolve);
          })
          .on('error', reject);
      });
    } finally {
      span.end();
    }
  });
} finally {
  server.close();
  assert(await shutdownTelemetry(3_000), 'SDK must flush within the shutdown deadline');
}
assert(
  exported.some((span) => span.instrumentationScope.name === '@opentelemetry/instrumentation-http'),
  'Native ESM HTTP spans must be captured',
);
assert(
  !JSON.stringify(
    exported.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events })),
  ).includes('fixture-private-value'),
  'Private values must be absent from exported spans',
);
console.log('Worker bundled ESM telemetry, privacy and bounded shutdown smoke passed.');
