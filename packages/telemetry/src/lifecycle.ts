import { assertTelemetryExporterEnvironment, getTelemetryConfig } from '@repo/config/telemetry';
import type { TelemetryConfig } from '@repo/config/telemetry';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { AggregationTemporality, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import type { PushMetricExporter } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PrivateSpanExporter, sanitizeTraceAttributes } from './privacy';
import { privateTracePropagator } from './propagation';

export interface TelemetryRuntime {
  start(): void;
  shutdown(): Promise<void>;
}

export interface InitTelemetryOptions {
  service: 'tickif-api' | 'tickif-worker' | 'tickif-web';
  config?: TelemetryConfig;
  /** Next uses its native spans; Hono uses explicit inbound request spans. */
  instrumentation?: 'dependencies' | 'all' | 'none';
  /** Inject in-memory exporters/runtime in tests; production defaults use private OTLP. */
  spanExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  sdkFactory?: (options: Partial<NodeSDKConfiguration>) => TelemetryRuntime;
}

function endpoint(base: string, signal: string): string {
  return `${base.replace(/\/+$/, '')}/v1/${signal}`;
}

function sdkOptions(options: InitTelemetryOptions, config: TelemetryConfig): Partial<NodeSDKConfiguration> {
  const base = config.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!base) throw new Error('Missing telemetry endpoint');
  const mode = options.instrumentation ?? 'dependencies';
  const instrumentations = mode === 'none' ? [] : [
    new HttpInstrumentation({
      disableIncomingRequestInstrumentation: mode !== 'all',
      ignoreIncomingRequestHook: (request) => /^\/(health|ready|live)(\/|\?|$)/.test(request.url ?? ''),
    }),
    new UndiciInstrumentation(),
    new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
    new IORedisInstrumentation({ dbStatementSerializer: () => '[redacted]', requireParentSpan: true }),
  ];
  const exporter = options.spanExporter ?? new OTLPTraceExporter({
    url: endpoint(base, 'traces'), timeoutMillis: 2_000, headers: {}, concurrencyLimit: 1,
  });
  const metricExporter = options.metricExporter ?? new OTLPMetricExporter({
    url: endpoint(base, 'metrics'), timeoutMillis: 2_000, headers: {}, concurrencyLimit: 1,
    temporalityPreference: AggregationTemporality.CUMULATIVE,
  });
  return {
    resource: resourceFromAttributes({
      'service.name': config.OTEL_SERVICE_NAME ?? options.service,
      'service.version': config.APP_VERSION,
      'service.namespace': 'tickif',
      'deployment.environment.name': config.DEPLOYMENT_ENVIRONMENT,
    }),
    // Environment/host detectors can collect command arguments or collector
    // identity. Identity is explicit and the collector owns infrastructure data.
    autoDetectResources: false,
    textMapPropagator: privateTracePropagator,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.OTEL_TRACES_SAMPLER_ARG) }),
    spanLimits: { attributeCountLimit: 64, attributeValueLengthLimit: 256, eventCountLimit: 8, linkCountLimit: 0 },
    spanProcessors: [new BatchSpanProcessor(new PrivateSpanExporter(exporter), {
      maxQueueSize: 512, maxExportBatchSize: 64, scheduledDelayMillis: 1_000, exportTimeoutMillis: 2_000,
    })],
    metricReaders: [new PeriodicExportingMetricReader({
      exporter: metricExporter, exportIntervalMillis: 30_000, exportTimeoutMillis: 2_500,
    })],
    views: [{
      instrumentName: '*', attributesProcessors: [{ process: sanitizeTraceAttributes }], aggregationCardinalityLimit: 1000,
    }],
    logRecordProcessors: [],
    instrumentations,
  };
}

/** Isolated controller is also useful in deterministic tests without global reset hacks. */
export function createTelemetryController() {
  let runtime: TelemetryRuntime | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let stopped = false;

  function init(options: InitTelemetryOptions): boolean {
    if (runtime) return !stopped;
    if (stopped) return false;
    const config = options.config ?? getTelemetryConfig();
    if (!config.TELEMETRY_ENABLED) return false;
    let candidate: TelemetryRuntime | undefined;
    try {
      // OTLP exporters merge ambient headers even with headers: {}. Check the
      // actual config boundary here too so injected config cannot bypass it.
      assertTelemetryExporterEnvironment(config.TELEMETRY_ENABLED);
      const settings = sdkOptions(options, config);
      candidate = options.sdkFactory?.(settings) ?? new NodeSDK(settings);
      candidate.start();
      runtime = candidate;
      return true;
    } catch {
      // A start failure may have registered some providers. Do not initialize
      // a second SDK over that partial runtime; release it best effort.
      if (candidate) {
        stopped = true;
        void Promise.resolve().then(() => candidate?.shutdown()).catch(() => undefined);
      }
      // Do not emit raw SDK/config errors: endpoints and provider error messages
      // can contain private data. Telemetry failure must not prevent app boot.
      return false;
    }
  }

  async function shutdown(timeoutMs = 3_000): Promise<boolean> {
    if (!runtime) return true;
    stopped = true;
    shutdownPromise ??= Promise.resolve().then(() => runtime?.shutdown()).then(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        shutdownPromise.then(() => true, () => false),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, Math.min(timeoutMs, 30_000)));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { init, shutdown };
}

type Controller = ReturnType<typeof createTelemetryController>;
const SINGLETON = Symbol.for('tickif.telemetry.controller.v1');
const processGlobals = globalThis as typeof globalThis & { [SINGLETON]?: Controller };

function controller(): Controller {
  return processGlobals[SINGLETON] ??= createTelemetryController();
}

export function initTelemetry(options: InitTelemetryOptions): boolean { return controller().init(options); }
export function shutdownTelemetry(timeoutMs = 3_000): Promise<boolean> { return controller().shutdown(timeoutMs); }
